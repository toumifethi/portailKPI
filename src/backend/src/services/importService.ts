import { prisma } from '@/db/prisma';
import { scheduleImportJob } from '@/importer/importOrchestrator';
import { logger } from '@/utils/logger';

/**
 * Déclenche les imports planifiés pour tous les clients actifs.
 * Appelé par le cron quotidien (cf. DA-002).
 */
export async function triggerScheduledImports(): Promise<void> {
  const clients = await prisma.client.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true, name: true },
  });

  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

  for (const client of clients) {
    try {
      await scheduleImportJob(client.id, 'SCHEDULED', periodStart, periodEnd);
      logger.info('Scheduled import enqueued', { clientId: client.id, clientName: client.name });
    } catch (err) {
      logger.error('Failed to schedule import', {
        clientId: client.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

/**
 * Retourne le statut du dernier import d'un client.
 */
export async function getLastImportStatus(clientId: number) {
  return prisma.importJob.findFirst({
    where: { clientId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      status: true,
      type: true,
      triggeredBy: true,
      startedAt: true,
      completedAt: true,
      issuesFetched: true,
      worklogsFetched: true,
      errorCount: true,
    },
  });
}
