import { prisma } from '@/db/prisma';
import { JiraClient, JiraUserInfo } from '../jiraClient';
import { TempoClient } from '../tempoClient';
import { logger } from '@/utils/logger';

export interface WorklogSyncResult {
  count: number;
  authors: Map<string, JiraUserInfo>;     // accountId → { displayName, emailAddress? }
  worklogIssueIds: Set<string>;           // jiraIds des issues avec du temps saisi
}

/**
 * Phase 3 : synchronise les worklogs → table `worklogs`.
 * - Si Tempo configuré : utilise l'API Tempo.
 * - Sinon : utilise les worklogs natifs JIRA (GET /issue/{key}/worklog).
 * Retourne aussi la map des auteurs collectés (pour syncMembers).
 */
/**
 * @param newIssueJiraIds — IDs des issues nouvellement créées en base (pour backfill complet des worklogs)
 */
export async function syncWorklogs(
  jiraClient: JiraClient,
  tempoClient: TempoClient | null,
  clientId: number,
  projectIds: number[],
  projectKeys: string[],
  periodStart: Date,
  periodEnd: Date,
  newIssueJiraIds: Set<string> = new Set(),
): Promise<WorklogSyncResult> {
  if (tempoClient) {
    return syncWorklogsTempo(tempoClient, clientId, projectIds, projectKeys, periodStart, periodEnd, newIssueJiraIds);
  }
  return syncWorklogsNative(jiraClient, clientId, projectIds, periodStart, periodEnd, newIssueJiraIds);
}

// ---------------------------------------------------------------------------
// Tempo
// ---------------------------------------------------------------------------

async function syncWorklogsTempo(
  tempoClient: TempoClient,
  clientId: number,
  projectIds: number[],
  projectKeys: string[],
  periodStart: Date,
  periodEnd: Date,
  newIssueJiraIds: Set<string> = new Set(),
): Promise<WorklogSyncResult> {
  const from = periodStart.toISOString().slice(0, 10);
  const to = periodEnd.toISOString().slice(0, 10);

  const issueMap = new Map<string, number>();
  const issues = await prisma.issue.findMany({
    where: { clientId, projectId: { in: projectIds } },
    select: { id: true, jiraId: true },
  });
  for (const i of issues) issueMap.set(i.jiraId, i.id);

  // Purge des anciens worklogs JIRA natifs pour ce client avant import Tempo
  // (le compte de service Tempo était enregistré comme auteur — Tempo est désormais la source de vérité)
  const issueIds = [...issueMap.values()];
  if (issueIds.length > 0) {
    const purged = await prisma.worklog.deleteMany({
      where: { issueId: { in: issueIds }, source: 'JIRA' },
    });
    if (purged.count > 0) {
      logger.info('syncWorklogs(Tempo): purged old JIRA-native worklogs', { clientId, count: purged.count });
    }
  }

  const authors = new Map<string, JiraUserInfo>();
  const worklogIssueIds = new Set<string>(); // jiraIds des issues avec du temps
  let count = 0;

  for (const projectKey of projectKeys) {
    for await (const worklog of tempoClient.getWorklogsForProject(projectKey, from, to)) {
      const jiraIssueId = String(worklog.issue.id);
      worklogIssueIds.add(jiraIssueId);

      const issueId = issueMap.get(jiraIssueId) ?? null;
      if (issueId === null) continue;

      if (!authors.has(worklog.author.accountId)) {
        authors.set(worklog.author.accountId, {
          accountId: worklog.author.accountId,
          displayName: worklog.author.displayName,
        });
      }

      const tempoWorklogId = String(worklog.tempoWorklogId);
      const jiraWorklogId = worklog.jiraWorklogId ? String(worklog.jiraWorklogId) : null;

      await prisma.worklog.upsert({
        where: { issueId_tempoWorklogId: { issueId, tempoWorklogId } },
        create: {
          issueId,
          tempoWorklogId,
          jiraWorklogId,
          authorJiraAccountId: worklog.author.accountId,
          timeSpentSeconds: worklog.timeSpentSeconds,
          startedAt: new Date(worklog.startDate),
          source: 'TEMPO',
        },
        update: { timeSpentSeconds: worklog.timeSpentSeconds },
      });
      count++;
    }
    logger.info('syncWorklogs(Tempo): project done', { clientId, projectKey });
  }

  // Backfill : pour les nouvelles issues, récupérer les worklogs historiques
  if (newIssueJiraIds.size > 0) {
    // Trouver les nouvelles issues dont les worklogs n'ont pas été couverts par la fenêtre
    const newIssuesWithTime = await prisma.issue.findMany({
      where: {
        clientId,
        jiraId: { in: [...newIssueJiraIds] },
        timeSpentSeconds: { gt: 0 },
      },
      select: { id: true, jiraId: true, jiraKey: true, jiraCreatedAt: true, projectId: true },
    });

    // Ne backfill que les issues qui n'ont PAS déjà été couvertes par la fenêtre normale
    const alreadyCovered = new Set(worklogIssueIds);
    const toBackfill = newIssuesWithTime.filter((i) => !alreadyCovered.has(i.jiraId));

    if (toBackfill.length > 0) {
      logger.info('syncWorklogs(Tempo): backfilling worklogs for new issues', { clientId, count: toBackfill.length });

      // Grouper par projectKey pour les appels Tempo
      const projectMap = await prisma.project.findMany({
        where: { id: { in: [...new Set(toBackfill.map((i) => i.projectId))] } },
        select: { id: true, jiraProjectKey: true },
      });
      const projKeyMap = new Map(projectMap.map((p) => [p.id, p.jiraProjectKey]));

      // Pour chaque projet, fetch les worklogs depuis la création de la plus ancienne issue
      const byProject = new Map<string, typeof toBackfill>();
      for (const issue of toBackfill) {
        const key = projKeyMap.get(issue.projectId) ?? '';
        if (!key) continue;
        if (!byProject.has(key)) byProject.set(key, []);
        byProject.get(key)!.push(issue);
      }

      for (const [projectKey, projectIssues] of byProject) {
        const oldest = projectIssues.reduce((min, i) => i.jiraCreatedAt < min ? i.jiraCreatedAt : min, projectIssues[0].jiraCreatedAt);
        const backfillFrom = oldest.toISOString().slice(0, 10);
        const backfillTo = periodStart.toISOString().slice(0, 10); // Jusqu'au début de la fenêtre normale (pas de doublons)
        const backfillIssueIds = new Set(projectIssues.map((i) => i.jiraId));

        let backfillCount = 0;
        for await (const worklog of tempoClient.getWorklogsForProject(projectKey, backfillFrom, backfillTo)) {
          const jiraIssueId = String(worklog.issue.id);
          if (!backfillIssueIds.has(jiraIssueId)) continue;

          const issueId = issueMap.get(jiraIssueId);
          if (!issueId) continue;

          if (!authors.has(worklog.author.accountId)) {
            authors.set(worklog.author.accountId, {
              accountId: worklog.author.accountId,
              displayName: worklog.author.displayName,
            });
          }

          const tempoWorklogId = String(worklog.tempoWorklogId);
          const jiraWorklogId = worklog.jiraWorklogId ? String(worklog.jiraWorklogId) : null;

          await prisma.worklog.upsert({
            where: { issueId_tempoWorklogId: { issueId, tempoWorklogId } },
            create: {
              issueId,
              tempoWorklogId,
              jiraWorklogId,
              authorJiraAccountId: worklog.author.accountId,
              timeSpentSeconds: worklog.timeSpentSeconds,
              startedAt: new Date(worklog.startDate),
              source: 'TEMPO',
            },
            update: { timeSpentSeconds: worklog.timeSpentSeconds },
          });
          backfillCount++;
        }
        count += backfillCount;
        logger.info('syncWorklogs(Tempo): backfill project done', { projectKey, backfillCount, backfillFrom, backfillTo });
      }
    }
  }

  logger.info('syncWorklogs(Tempo): completed', { clientId, count, authorsFound: authors.size, issuesWithWorklogs: worklogIssueIds.size });
  return { count, authors, worklogIssueIds };
}

// ---------------------------------------------------------------------------
// JIRA natif
// ---------------------------------------------------------------------------

async function syncWorklogsNative(
  jiraClient: JiraClient,
  clientId: number,
  projectIds: number[],
  periodStart: Date,
  periodEnd: Date,
  newIssueJiraIds: Set<string> = new Set(),
): Promise<WorklogSyncResult> {
  const issues = await prisma.issue.findMany({
    where: { clientId, projectId: { in: projectIds }, timeSpentSeconds: { gt: 0 } },
    select: { id: true, jiraId: true, jiraKey: true },
  });

  // Purge des anciens worklogs Tempo si on repasse en mode JIRA natif (token retiré)
  const issueIds = issues.map((i) => i.id);
  if (issueIds.length > 0) {
    const purged = await prisma.worklog.deleteMany({
      where: { issueId: { in: issueIds }, source: 'TEMPO' },
    });
    if (purged.count > 0) {
      logger.info('syncWorklogs(JIRA native): purged old Tempo worklogs', { clientId, count: purged.count });
    }
  }

  const periodStartMs = periodStart.getTime();
  const periodEndMs = periodEnd.getTime();

  const authors = new Map<string, JiraUserInfo>();
  const worklogIssueIds = new Set<string>();
  let count = 0;

  for (const issue of issues) {
    const isNewIssue = newIssueJiraIds.has(issue.jiraId);
    for await (const worklog of jiraClient.getIssueWorklogs(issue.jiraKey)) {
      const startedMs = new Date(worklog.started).getTime();
      // Pour les nouvelles issues : pas de filtre de période (backfill complet)
      if (!isNewIssue && (startedMs < periodStartMs || startedMs > periodEndMs)) continue;

      worklogIssueIds.add(issue.jiraId);

      if (!authors.has(worklog.author.accountId)) {
        authors.set(worklog.author.accountId, {
          accountId: worklog.author.accountId,
          displayName: worklog.author.displayName,
          emailAddress: worklog.author.emailAddress,
        });
      }

      await prisma.worklog.upsert({
        where: { issueId_jiraWorklogId: { issueId: issue.id, jiraWorklogId: worklog.id } },
        create: {
          issueId: issue.id,
          jiraWorklogId: worklog.id,
          authorJiraAccountId: worklog.author.accountId,
          timeSpentSeconds: worklog.timeSpentSeconds,
          startedAt: new Date(worklog.started),
          source: 'JIRA',
        },
        update: { timeSpentSeconds: worklog.timeSpentSeconds },
      });
      count++;
    }
  }

  logger.info('syncWorklogs(JIRA native): completed', { clientId, count, authorsFound: authors.size, issuesWithWorklogs: worklogIssueIds.size });
  return { count, authors, worklogIssueIds };
}
