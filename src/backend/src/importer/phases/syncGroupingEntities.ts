import { prisma } from '@/db/prisma';
import { JiraClient } from '../jiraClient';
import { logger } from '@/utils/logger';
import { JiraFieldMapping, DEFAULT_FIELD_MAPPING } from '@/types/domain';

/**
 * Phase 4 : synchronise les entités de regroupement (Epics, Sprints, Versions…)
 * depuis les champs custom des issues déjà importées.
 *
 * Stratégie : lecture des customFields stockés dans `issues.customFields` JSON,
 * puis upsert dans `grouping_entities`.
 */
export async function syncGroupingEntities(
  _jiraClient: JiraClient,
  clientId: number,
  projectIds: number[],
  fieldMapping: JiraFieldMapping = DEFAULT_FIELD_MAPPING,
): Promise<void> {
  // Épics : issues de type Epic dans les projets
  const epics = await prisma.issue.findMany({
    where: {
      clientId,
      projectId: { in: projectIds },
      issueType: 'Epic',
    },
    select: { id: true, jiraId: true, jiraKey: true, summary: true, projectId: true },
  });

  for (const epic of epics) {
    await prisma.groupingEntity.upsert({
      where: {
        clientId_jiraId_entityType: {
          clientId,
          entityType: 'EPIC',
          jiraId: epic.jiraId,
        },
      },
      create: {
        clientId,
        projectId: epic.projectId,
        entityType: 'EPIC',
        jiraId: epic.jiraId,
        name: epic.summary,
        status: 'ACTIVE',
      },
      update: {
        name: epic.summary,
      },
    });
  }

  logger.info('syncGroupingEntities: epics synced', { clientId, count: epics.length });

  // Sprints : extraits depuis le champ configuré dans fieldMapping
  const sprintFieldId = fieldMapping.sprints;
  const issuesWithSprint = await prisma.issue.findMany({
    where: { clientId, projectId: { in: projectIds } },
    select: { id: true, projectId: true, customFields: true },
  });

  const sprintsSeen = new Map<
    string,
    { name: string; projectId: number | null; state: string | null; startDate: Date | null; endDate: Date | null }
  >();

  for (const issue of issuesWithSprint) {
    const fields = issue.customFields as Record<string, unknown> | null;
    if (!fields) continue;

    const sprintField = sprintFieldId ? fields[sprintFieldId] : undefined;
    if (!Array.isArray(sprintField) || sprintField.length === 0) continue;

    // Process ALL sprints in the array, not just the first one
    for (const rawSprint of sprintField) {
      const sprint = rawSprint as Record<string, unknown>;
      const sprintId = String(sprint.id ?? '');
      if (!sprintId) continue;

      // Keep the latest info (overwrite if already seen — sprint metadata is the same across issues)
      sprintsSeen.set(sprintId, {
        name: String(sprint.name ?? sprintId),
        projectId: issue.projectId,
        state: sprint.state ? String(sprint.state) : null,
        startDate: sprint.startDate ? new Date(String(sprint.startDate)) : null,
        endDate: sprint.endDate ? new Date(String(sprint.endDate)) : null,
      });
    }
  }

  for (const [jiraId, data] of sprintsSeen) {
    await prisma.groupingEntity.upsert({
      where: {
        clientId_jiraId_entityType: {
          clientId,
          entityType: 'SPRINT',
          jiraId,
        },
      },
      create: {
        clientId,
        projectId: data.projectId,
        entityType: 'SPRINT',
        jiraId,
        name: data.name,
        status: 'ACTIVE',
        startDate: data.startDate,
        endDate: data.endDate,
        state: data.state,
      },
      update: {
        name: data.name,
        startDate: data.startDate,
        endDate: data.endDate,
        state: data.state,
      },
    });
  }

  logger.info('syncGroupingEntities: sprints synced', { clientId, count: sprintsSeen.size });
}
