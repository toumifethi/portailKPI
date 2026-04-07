import { prisma } from '@/db/prisma';
import { JiraClient, JiraIssue } from '../jiraClient';
import { logger } from '@/utils/logger';
import { JiraFieldMapping, DEFAULT_FIELD_MAPPING } from '@/types/domain';

// Champs JIRA fixes à récupérer pour chaque issue
const BASE_ISSUE_FIELDS = [
  'summary',
  'status',
  'issuetype',
  'assignee',
  'priority',
  'project',
  'created',
  'updated',
  'resolutiondate',
  'timeoriginalestimate',
  'timespent',
  'timeestimate',
  'subtasks',
  'parent',
  'labels',
  'issuelinks',
];

/**
 * Phase 2 : synchronise les issues JIRA → table `issues`.
 * Paginate via searchIssues (JQL updated >= lastSyncDate ou full sync).
 * Upsert sur (jiraIssueId × clientId).
 */
export interface AssigneeInfo {
  displayName: string;
  emailAddress?: string;
}

export async function syncIssues(
  jiraClient: JiraClient,
  clientId: number,
  projectIds: number[],
  projectKeys: string[],
  periodStart: Date,
  periodEnd: Date,
  jqlOverride?: string,
  customFields: string[] = [],
  worklogIssueIds: Set<string> = new Set(),
  fieldMapping: JiraFieldMapping = DEFAULT_FIELD_MAPPING,
): Promise<{ count: number; assignees: Map<string, AssigneeInfo>; newIssueJiraIds: Set<string> }> {
  // Build JIRA fields list dynamically from mapping
  const mappedFields = [fieldMapping.storyPoints, fieldMapping.sprints].filter((f): f is string => !!f);
  const allFields = [...BASE_ISSUE_FIELDS, ...mappedFields, ...customFields];
  const from = periodStart.toISOString().slice(0, 10);
  const to = periodEnd.toISOString().slice(0, 10);

  let jql: string;
  if (jqlOverride) {
    jql = `(${jqlOverride}) AND updated >= "${from}" AND updated <= "${to}" ORDER BY updated ASC`;
  } else {
    const projectFilter = projectKeys.map((k) => `"${k}"`).join(',');
    jql = `project IN (${projectFilter}) AND updated >= "${from}" AND updated <= "${to}" ORDER BY updated ASC`;
  }

  // Map jiraProjectKey → DB projectId
  const projectMap = new Map<string, number>();
  const projects = await prisma.project.findMany({
    where: { id: { in: projectIds } },
    select: { id: true, jiraProjectKey: true },
  });
  for (const p of projects) {
    if (p.jiraProjectKey) projectMap.set(p.jiraProjectKey, p.id);
  }

  // IDs déjà traités pour éviter les doublons
  const processedJiraIds = new Set<string>();
  const assignees = new Map<string, AssigneeInfo>();
  const newIssueJiraIds = new Set<string>(); // Issues nouvellement créées en base
  let count = 0;

  const processIssue = async (issue: JiraIssue) => {
    if (!issue.fields || processedJiraIds.has(issue.id)) return;
    processedJiraIds.add(issue.id);

    const projectId = projectMap.get(issue.fields.project?.key ?? '') ?? null;
    if (projectId === null) return;

    const assignee = issue.fields.assignee;
    if (assignee?.accountId && !assignees.has(assignee.accountId)) {
      assignees.set(assignee.accountId, {
        displayName: assignee.displayName,
        emailAddress: assignee.emailAddress,
      });
    }

    const { isNew } = await upsertIssue(issue, clientId, projectId, fieldMapping);
    if (isNew) newIssueJiraIds.add(issue.id);
    count++;
  };

  // Phase A : JQL (toutes les issues mises à jour sur la période)
  for await (const issue of jiraClient.searchIssues(jql, allFields)) {
    if (!issue.fields) {
      logger.warn('syncIssues: issue has no fields, skipping', { issueKey: issue.key });
      continue;
    }
    await processIssue(issue);
    if (count % 500 === 0 && count > 0) {
      logger.info('syncIssues: JQL progress', { clientId, count });
    }
  }

  logger.info('syncIssues: JQL phase done', { clientId, count });

  // Phase B : fetch ciblé des issues avec worklogs + remontée parents jusqu'à l'epic
  if (worklogIssueIds.size > 0) {
    const toFetchIds = [...worklogIssueIds].filter((id) => !processedJiraIds.has(id));

    if (toFetchIds.length > 0) {
      logger.info('syncIssues: fetching worklog-specific issues', { count: toFetchIds.length });
      // Batch par 100 via JQL issue IN (...)
      const BATCH = 100;
      for (let i = 0; i < toFetchIds.length; i += BATCH) {
        const batch = toFetchIds.slice(i, i + BATCH);
        const batchJql = `issue IN (${batch.join(',')}) ORDER BY updated ASC`;
        for await (const issue of jiraClient.searchIssues(batchJql, allFields)) {
          if (!issue.fields) continue;
          await processIssue(issue);
        }
      }
    }

    // Remontée parents jusqu'à l'epic (max 3 niveaux)
    await fetchParentsUpToEpic(jiraClient, clientId, projectMap, allFields, processedJiraIds, assignees, processIssue);
  }

  // Phase C : calcul des rollups (self + sous-tâches pour parents, self + issues pour epics)
  await computeRollups(clientId);

  logger.info('syncIssues: completed', { clientId, count, assigneesFound: assignees.size });
  return { count, assignees, newIssueJiraIds };
}

/**
 * Pour chaque issue traitée qui a un parent non encore fetché,
 * remonte la chaîne jusqu'à l'epic (max 3 niveaux).
 */
async function fetchParentsUpToEpic(
  jiraClient: JiraClient,
  _clientId: number,
  projectMap: Map<string, number>,
  allFields: string[],
  processedJiraIds: Set<string>,
  assignees: Map<string, AssigneeInfo>,
  processIssue: (issue: JiraIssue) => Promise<void>,
): Promise<void> {
  // Récupère les parentIds des issues déjà en base qui ne sont pas encore fetchés
  let currentIds = [...processedJiraIds];

  for (let level = 0; level < 3; level++) {
    const parents = await prisma.issue.findMany({
      where: {
        jiraId: { in: currentIds },
        customFields: { path: ['$.parent.id'], not: null },
      },
      select: { customFields: true },
    });

    const parentIds = new Set<string>();
    for (const issue of parents) {
      const cf = issue.customFields as Record<string, unknown> | null;
      const parentId = (cf?.['parent'] as { id?: string } | undefined)?.id;
      if (parentId && !processedJiraIds.has(parentId)) {
        parentIds.add(parentId);
      }
    }

    if (parentIds.size === 0) break;

    logger.info('syncIssues: fetching parent issues', { level: level + 1, count: parentIds.size });

    const BATCH = 100;
    const ids = [...parentIds];
    for (let i = 0; i < ids.length; i += BATCH) {
      const batch = ids.slice(i, i + BATCH);
      const batchJql = `issue IN (${batch.join(',')}) ORDER BY updated ASC`;
      for await (const issue of jiraClient.searchIssues(batchJql, allFields)) {
        if (!issue.fields) continue;
        await processIssue(issue);
        // Si c'est un Epic, on s'arrête là pour cette branche
      }
    }

    currentIds = [...parentIds];
  }
}

async function upsertIssue(
  issue: JiraIssue,
  clientId: number,
  projectId: number,
  fieldMapping: JiraFieldMapping = DEFAULT_FIELD_MAPPING,
): Promise<{ isNew: boolean }> {
  const f = issue.fields;

  // Déterminer le parentJiraId (parent direct ou epic)
  const parentJiraId: string | null =
    f.parent?.id ?? null;

  const commonFields = {
    summary: f.summary ?? '',
    status: f.status?.name ?? 'Unknown',
    issueType: f.issuetype?.name ?? 'Unknown',
    assigneeJiraAccountId: f.assignee?.accountId ?? null,
    parentJiraId,
    originalEstimateSeconds: f.timeoriginalestimate ?? null,
    originalEstimateHours: f.timeoriginalestimate ? f.timeoriginalestimate / 3600 : null,
    timeSpentSeconds: f.timespent ?? null,
    remainingEstimateSeconds: f.timeestimate ?? null,
    storyPoints: fieldMapping.storyPoints && typeof f[fieldMapping.storyPoints] === 'number' ? f[fieldMapping.storyPoints] : null,
    jiraUpdatedAt: new Date(f.updated),
    resolvedAt: f.resolutiondate ? new Date(f.resolutiondate) : null,
    customFields: extractCustomFields(f),
  };

  // Détecte si c'est une nouvelle issue (pour backfill worklogs)
  const existing = await prisma.issue.findUnique({ where: { clientId_jiraId: { clientId, jiraId: issue.id } }, select: { id: true } });
  const isNew = !existing;

  const upsertedIssue = await prisma.issue.upsert({
    where: { clientId_jiraId: { clientId, jiraId: issue.id } },
    create: {
      clientId,
      projectId,
      jiraId: issue.id,
      jiraKey: issue.key,
      jiraCreatedAt: new Date(f.created),
      ...commonFields,
    },
    update: commonFields,
  });

  // --- Sprint links: parse sprint field and upsert IssueSprint records ---
  const sprintField = fieldMapping.sprints ? f[fieldMapping.sprints] : undefined;
  if (Array.isArray(sprintField) && sprintField.length > 0) {
    for (const rawSprint of sprintField) {
      const sprint = rawSprint as Record<string, unknown>;
      const sprintJiraId = String(sprint.id ?? '');
      if (!sprintJiraId) continue;

      // Upsert the sprint as a GroupingEntity (with dates & state)
      const groupingEntity = await prisma.groupingEntity.upsert({
        where: {
          clientId_jiraId_entityType: {
            clientId,
            entityType: 'SPRINT',
            jiraId: sprintJiraId,
          },
        },
        create: {
          clientId,
          projectId,
          entityType: 'SPRINT',
          jiraId: sprintJiraId,
          name: String(sprint.name ?? sprintJiraId),
          status: 'ACTIVE',
          startDate: sprint.startDate ? new Date(String(sprint.startDate)) : null,
          endDate: sprint.endDate ? new Date(String(sprint.endDate)) : null,
          state: sprint.state ? String(sprint.state) : null,
        },
        update: {
          name: String(sprint.name ?? sprintJiraId),
          startDate: sprint.startDate ? new Date(String(sprint.startDate)) : null,
          endDate: sprint.endDate ? new Date(String(sprint.endDate)) : null,
          state: sprint.state ? String(sprint.state) : null,
        },
      });

      // Upsert the IssueSprint link
      await prisma.issueSprint.upsert({
        where: {
          issueId_groupingEntityId: {
            issueId: upsertedIssue.id,
            groupingEntityId: groupingEntity.id,
          },
        },
        create: {
          issueId: upsertedIssue.id,
          groupingEntityId: groupingEntity.id,
        },
        update: {},
      });
    }
  }

  // --- Issue links: parse issuelinks field and upsert IssueLink records ---
  const issueLinks = f.issuelinks as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(issueLinks) && issueLinks.length > 0) {
    for (const link of issueLinks) {
      const linkId = String(link.id ?? '');
      if (!linkId) continue;

      const linkType = link.type as Record<string, unknown> | undefined;
      let linkTypeName: string;
      let linkedJiraId: string | undefined;
      let sourceIssueDbId: number;
      let targetIssueDbId: number | undefined;

      if (link.outwardIssue) {
        // Current issue is source, outward issue is target
        const outward = link.outwardIssue as Record<string, unknown>;
        linkedJiraId = String(outward.id ?? '');
        linkTypeName = String(linkType?.outward ?? linkType?.name ?? 'relates to');

        // Look up the target issue in DB
        const targetIssue = await prisma.issue.findUnique({
          where: { clientId_jiraId: { clientId, jiraId: linkedJiraId } },
          select: { id: true },
        });
        if (!targetIssue) continue; // linked issue not imported yet, skip

        sourceIssueDbId = upsertedIssue.id;
        targetIssueDbId = targetIssue.id;
      } else if (link.inwardIssue) {
        // Current issue is target, inward issue is source
        const inward = link.inwardIssue as Record<string, unknown>;
        linkedJiraId = String(inward.id ?? '');
        linkTypeName = String(linkType?.inward ?? linkType?.name ?? 'relates to');

        // Look up the source issue in DB
        const sourceIssue = await prisma.issue.findUnique({
          where: { clientId_jiraId: { clientId, jiraId: linkedJiraId } },
          select: { id: true },
        });
        if (!sourceIssue) continue; // linked issue not imported yet, skip

        sourceIssueDbId = sourceIssue.id;
        targetIssueDbId = upsertedIssue.id;
      } else {
        continue; // no linked issue data
      }

      if (!targetIssueDbId) continue;

      await prisma.issueLink.upsert({
        where: {
          sourceIssueId_jiraLinkId: {
            sourceIssueId: sourceIssueDbId,
            jiraLinkId: linkId,
          },
        },
        create: {
          jiraLinkId: linkId,
          sourceIssueId: sourceIssueDbId,
          targetIssueId: targetIssueDbId,
          linkType: linkTypeName,
        },
        update: {
          targetIssueId: targetIssueDbId,
          linkType: linkTypeName,
        },
      });
    }
  }

  return { isNew };
}

/**
 * Calcule les rollups pour toutes les issues du client :
 * - Sub-task : rollup = self
 * - Story/Bug/Task (parent) : rollup = self + SUM(sous-tâches directes)
 * - Epic : rollup = self + SUM(toutes issues filles + leurs sous-tâches)
 */
async function computeRollups(clientId: number): Promise<void> {
  logger.info('computeRollups: starting', { clientId });

  // Charger toutes les issues du client avec les champs nécessaires
  const allIssues = await prisma.issue.findMany({
    where: { clientId },
    select: {
      id: true,
      jiraId: true,
      issueType: true,
      parentJiraId: true,
      originalEstimateSeconds: true,
      timeSpentSeconds: true,
      remainingEstimateSeconds: true,
    },
  });

  // Index par jiraId
  const byJiraId = new Map(allIssues.map((i) => [i.jiraId, i]));

  // Index enfants par parentJiraId
  const childrenOf = new Map<string, typeof allIssues>();
  for (const issue of allIssues) {
    if (issue.parentJiraId) {
      const arr = childrenOf.get(issue.parentJiraId) ?? [];
      arr.push(issue);
      childrenOf.set(issue.parentJiraId, arr);
    }
  }

  // Calcul récursif avec memo
  const memo = new Map<string, { est: number; spent: number; remaining: number }>();

  function getRollup(jiraId: string): { est: number; spent: number; remaining: number } {
    if (memo.has(jiraId)) return memo.get(jiraId)!;

    const issue = byJiraId.get(jiraId);
    if (!issue) {
      const zero = { est: 0, spent: 0, remaining: 0 };
      memo.set(jiraId, zero);
      return zero;
    }

    let est = issue.originalEstimateSeconds ?? 0;
    let spent = issue.timeSpentSeconds ?? 0;
    let remaining = issue.remainingEstimateSeconds ?? 0;

    const children = childrenOf.get(jiraId) ?? [];
    for (const child of children) {
      const childRollup = getRollup(child.jiraId);
      est += childRollup.est;
      spent += childRollup.spent;
      remaining += childRollup.remaining;
    }

    const result = { est, spent, remaining };
    memo.set(jiraId, result);
    return result;
  }

  // Calculer pour chaque issue et batch update
  const BATCH = 500;
  const updates: { id: number; est: number; estH: number; spent: number; spentH: number; rem: number; remH: number }[] = [];

  for (const issue of allIssues) {
    const rollup = getRollup(issue.jiraId);
    updates.push({
      id: issue.id,
      est: rollup.est,
      estH: Math.round((rollup.est / 3600) * 10000) / 10000,
      spent: rollup.spent,
      spentH: Math.round((rollup.spent / 3600) * 10000) / 10000,
      rem: rollup.remaining,
      remH: Math.round((rollup.remaining / 3600) * 10000) / 10000,
    });
  }

  // Batch updates via transaction
  for (let i = 0; i < updates.length; i += BATCH) {
    const batch = updates.slice(i, i + BATCH);
    await prisma.$transaction(
      batch.map((u) =>
        prisma.issue.update({
          where: { id: u.id },
          data: {
            rollupEstimateSeconds: u.est,
            rollupEstimateHours: u.estH,
            rollupTimeSpentSeconds: u.spent,
            rollupTimeSpentHours: u.spentH,
            rollupRemainingSeconds: u.rem,
            rollupRemainingHours: u.remH,
          },
        }),
      ),
    );
  }

  logger.info('computeRollups: done', { clientId, issuesUpdated: updates.length });
}

function extractCustomFields(fields: JiraIssue['fields']): Record<string, unknown> {
  const custom: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (key.startsWith('customfield_') && value !== null && value !== undefined) {
      custom[key] = value;
    }
  }
  return custom;
}
