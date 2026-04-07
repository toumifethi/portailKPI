import axios from 'axios';
import { prisma } from '@/db/prisma';
import { importQueue } from '@/queue';
import { ImportJobPayload } from '@/types/domain';
import { logger } from '@/utils/logger';
import { JiraClient } from './jiraClient';
import { TempoClient } from './tempoClient';
import { syncMembers } from './phases/syncMembers';
import { syncIssues } from './phases/syncIssues';
import { syncWorklogs } from './phases/syncWorklogs';
import { syncGroupingEntities } from './phases/syncGroupingEntities';
import { syncCustomFields } from './phases/syncCustomFields';
import { syncTransitions } from './phases/syncTransitions';
import { completeJobLog } from '@/services/jobLogger';
import { JiraFieldMapping, DEFAULT_FIELD_MAPPING } from '@/types/domain';

/**
 * Worker d'import — consomme les jobs Bull et orchestre les 4 phases.
 */
export function startImportWorker(concurrency = 1): void {
  importQueue.process(concurrency, async (job) => {
    await processImportJob(job.data);
  });

  importQueue.on('failed', (job, err) => {
    logger.error('Import job failed in queue', { jobId: job.id, error: err.message });
  });

  logger.info('Import worker started — waiting for jobs', { concurrency });
}

/**
 * Traite un job d'import pour un client donné.
 * Appelé par le worker Bull de chaque queue `import:client:{id}`.
 */
export async function processImportJob(payload: ImportJobPayload): Promise<void> {
  const { clientId, importJobId, periodStart, periodEnd, jql } = payload;

  logger.info('Import job started', { clientId, importJobId });

  // Marquer le job comme RUNNING
  await prisma.importJob.update({
    where: { id: importJobId },
    data: { status: 'RUNNING', startedAt: new Date() },
  });

  try {
    // Charger la config client
    const client = await prisma.client.findUniqueOrThrow({
      where: { id: clientId },
      include: {
        jiraConnection: true,
        projects: { where: { status: 'ACTIVE' } },
      },
    });

    if (!client.jiraConnection) {
      throw new Error(`No JIRA connection configured for client ${clientId}`);
    }

    const jiraConn = client.jiraConnection;
    const fieldMapping: JiraFieldMapping = {
      ...DEFAULT_FIELD_MAPPING,
      ...(jiraConn.fieldMapping as Partial<JiraFieldMapping> ?? {}),
    };
    const jiraClient = new JiraClient(
      jiraConn.jiraUrl,
      jiraConn.jiraEmail,
      jiraConn.jiraApiToken,
    );

    // Tempo optionnel
    let tempoClient: TempoClient | null = null;
    if (jiraConn.tempoApiToken) {
      tempoClient = new TempoClient(jiraConn.tempoApiToken);
    }

    const projectIds = client.projects.map((p) => p.id);
    const projectKeys = client.projects
      .map((p) => p.jiraProjectKey)
      .filter((k): k is string => !!k);

    const start = new Date(periodStart);
    const end = new Date(periodEnd);

    // Phase 0 — Champs custom JIRA (métadonnées + options)
    await syncCustomFields(jiraClient, jiraConn.id);

    // Phase 1 — Issues (collecte aussi les assignees au passage)
    const extraJiraFields = Array.isArray(client.extraJiraFields) ? (client.extraJiraFields as string[]) : [];
    const { count: issuesFetched, assignees, newIssueJiraIds } = await syncIssues(
      jiraClient,
      clientId,
      projectIds,
      projectKeys,
      start,
      end,
      jql,
      extraJiraFields,
      undefined,
      fieldMapping,
    );

    // Phase 2 — Worklogs (avant membres pour collecter les auteurs)
    const { count: worklogsFetched, authors: authorsFromWorklogs } = await syncWorklogs(
      jiraClient,
      tempoClient,
      clientId,
      projectIds,
      projectKeys,
      start,
      end,
      newIssueJiraIds,
    );

    // Phase 3 — Membres : fusion assignees issues + auteurs worklogs + bulk API pour emails manquants
    const membersResult = await syncMembers(jiraClient, clientId, jiraConn.id, projectIds, assignees, authorsFromWorklogs);

    // Phase 4 — Entités de regroupement (Epics, Sprints)
    await syncGroupingEntities(jiraClient, clientId, projectIds, fieldMapping);

    // Phase 5 — Transitions de statut (changelog JIRA)
    let transitionsFetched = 0;
    if (client.importTransitions === true) {
      const { count } = await syncTransitions(jiraClient, clientId, start, end);
      transitionsFetched = count;
    }

    // Build functional details
    const details: string[] = [];
    details.push(`Issues : ${issuesFetched} (dont ${newIssueJiraIds.size} nouvelles)`);
    details.push(`Worklogs : ${worklogsFetched}`);
    details.push(`Membres : ${membersResult.imported} importés, ${membersResult.linked} liés, ${membersResult.created} créés`);
    if (transitionsFetched > 0) details.push(`Transitions : ${transitionsFetched}`);
    if (newIssueJiraIds.size > 0) details.push(`Backfill worklogs déclenché pour ${newIssueJiraIds.size} nouvelles issues`);

    // Marquer COMPLETED
    await prisma.importJob.update({
      where: { id: importJobId },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        issuesFetched,
        worklogsFetched,
        errorCount: 0,
      },
    });

    logger.info('Import job completed', { clientId, importJobId, issuesFetched, worklogsFetched });

    // Compléter le job log associé (s'il existe)
    try {
      const runningLog = await prisma.jobLog.findFirst({
        where: { jobType: 'IMPORT', clientId, status: 'RUNNING' },
        orderBy: { startedAt: 'desc' },
      });
      if (runningLog) {
        await completeJobLog(runningLog.id, {
          status: 'COMPLETED',
          itemsProcessed: issuesFetched + worklogsFetched,
          metadata: { issuesFetched, worklogsFetched, details },
        });
      }
    } catch { /* ignore job log errors */ }
  } catch (err) {
    let message = err instanceof Error ? err.message : String(err);

    // Enrichir le message si c'est une erreur axios (appel JIRA/Tempo)
    if (axios.isAxiosError(err)) {
      const method = (err.config?.method ?? 'HTTP').toUpperCase();
      const url = `${err.config?.baseURL ?? ''}${err.config?.url ?? ''}`;
      const status = err.response?.status ?? '?';
      const responseBody = err.response?.data
        ? JSON.stringify(err.response.data).slice(0, 800)
        : '(no response body)';
      message = `[${method} ${url}] → HTTP ${status}: ${responseBody}`;
      logger.error('Import job failed — API error', { clientId, importJobId, method, url, status, responseBody });
    } else {
      logger.error('Import job failed', { clientId, importJobId, error: message });
    }

    await prisma.importJob.update({
      where: { id: importJobId },
      data: {
        status: 'FAILED',
        completedAt: new Date(),
        errorCount: 1,
        errors: {
          create: { errorCode: 'IMPORT_FAILED', errorType: 'BLOCKING', message },
        },
      },
    });

    // Compléter le job log en erreur
    try {
      const runningLog = await prisma.jobLog.findFirst({
        where: { jobType: 'IMPORT', clientId, status: 'RUNNING' },
        orderBy: { startedAt: 'desc' },
      });
      if (runningLog) {
        await completeJobLog(runningLog.id, { status: 'FAILED', errorMessage: message });
      }
    } catch { /* ignore */ }

    throw err;
  }
}

/**
 * Enregistre un job d'import en base et le pousse dans la queue Bull.
 */
export async function scheduleImportJob(
  clientId: number,
  type: 'INCREMENTAL' | 'BACKFILL' | 'SCHEDULED',
  periodStart: Date,
  periodEnd: Date,
  jql?: string,
): Promise<number> {
  const job = await prisma.importJob.create({
    data: {
      clientId,
      type,
      status: 'PENDING',
      triggeredBy: type === 'SCHEDULED' ? 'SCHEDULER' : 'USER',
      fromDate: periodStart,
    },
  });

  await importQueue.add(
    {
      clientId,
      importJobId: job.id,
      type,
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      jql,
    } satisfies ImportJobPayload,
    { jobId: `import-${clientId}-${job.id}` },
  );

  logger.info('Import job scheduled', { clientId, importJobId: job.id, type });
  return job.id;
}

