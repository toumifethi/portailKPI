import { prisma } from '@/db/prisma';
import { JiraClient } from '../jiraClient';
import { logger } from '@/utils/logger';

/**
 * Phase 5 : synchronise l'historique des transitions de statut depuis
 * le changelog JIRA pour les issues mises à jour pendant la période d'import.
 */

interface JiraChangelogItem {
  field: string;
  fromString: string | null;
  toString: string;
}

interface JiraChangelogHistory {
  id: string;
  created: string;
  items: JiraChangelogItem[];
}

interface JiraIssueWithChangelog {
  id: string;
  key: string;
  changelog: {
    histories: JiraChangelogHistory[];
  };
}

const BATCH_SIZE = 50;

export async function syncTransitions(
  jiraClient: JiraClient,
  clientId: number,
  periodStart: Date,
  periodEnd: Date,
): Promise<{ count: number }> {
  logger.info('syncTransitions: starting', { clientId, periodStart, periodEnd });

  // 1. Find all issues for this client updated during the import period
  const issues = await prisma.issue.findMany({
    where: {
      clientId,
      jiraUpdatedAt: { gte: periodStart, lte: periodEnd },
    },
    select: { id: true, jiraKey: true },
  });

  logger.info('syncTransitions: issues to process', { clientId, count: issues.length });

  let totalTransitions = 0;

  // 2. Process in batches of 50
  for (let i = 0; i < issues.length; i += BATCH_SIZE) {
    const batch = issues.slice(i, i + BATCH_SIZE);

    const results = await Promise.allSettled(
      batch.map(async (issue) => {
        try {
          // 3. Fetch changelog from JIRA
          const data = await jiraClient.get<JiraIssueWithChangelog>(
            `/issue/${issue.jiraKey}?expand=changelog&fields=status`,
          );

          const histories = data.changelog?.histories ?? [];
          let issueTransitionCount = 0;

          for (const history of histories) {
            const changedAt = new Date(history.created);

            // 5. Only process transitions within the import period
            if (changedAt < periodStart || changedAt > periodEnd) {
              continue;
            }

            // 4. Filter to status changes only
            const statusItems = history.items.filter((item) => item.field === 'status');

            for (const item of statusItems) {
              // Check for existing record to avoid duplicates (no unique constraint)
              const existing = await prisma.issueTransition.findFirst({
                where: {
                  issueId: issue.id,
                  changedAt,
                  toStatus: item.toString,
                },
              });

              if (!existing) {
                await prisma.issueTransition.create({
                  data: {
                    issueId: issue.id,
                    fromStatus: item.fromString,
                    toStatus: item.toString,
                    changedAt,
                  },
                });
                issueTransitionCount++;
              }
            }
          }

          return issueTransitionCount;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          logger.warn('syncTransitions: failed to fetch changelog for issue', {
            jiraKey: issue.jiraKey,
            error: message,
          });
          return 0;
        }
      }),
    );

    for (const result of results) {
      if (result.status === 'fulfilled') {
        totalTransitions += result.value;
      }
    }

    logger.debug('syncTransitions: batch processed', {
      clientId,
      batchIndex: Math.floor(i / BATCH_SIZE) + 1,
      totalBatches: Math.ceil(issues.length / BATCH_SIZE),
    });
  }

  logger.info('syncTransitions: completed', { clientId, count: totalTransitions });
  return { count: totalTransitions };
}
