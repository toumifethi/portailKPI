import { Prisma } from '@prisma/client';
import { prisma } from '@/db/prisma';

/**
 * Creates a new JobLog entry with status RUNNING and startedAt = now.
 * Returns the jobLogId.
 */
export async function createJobLog(params: {
  jobType: 'IMPORT' | 'KPI_CALC';
  clientId?: number;
  kpiDefinitionId?: number;
  triggeredBy: 'MANUAL' | 'SCHEDULER';
  periodMode?: string;
  periodStart?: Date;
  periodEnd?: Date;
  scheduleId?: number;
}): Promise<number> {
  const log = await prisma.jobLog.create({
    data: {
      jobType: params.jobType,
      clientId: params.clientId ?? null,
      kpiDefinitionId: params.kpiDefinitionId ?? null,
      triggeredBy: params.triggeredBy,
      periodMode: params.periodMode ?? null,
      periodStart: params.periodStart ?? null,
      periodEnd: params.periodEnd ?? null,
      scheduleId: params.scheduleId ?? null,
      status: 'RUNNING',
      startedAt: new Date(),
    },
  });
  return log.id;
}

/**
 * Completes a JobLog entry: sets status, completedAt, durationMs, and optional counters.
 */
export async function completeJobLog(jobLogId: number, params: {
  status: 'COMPLETED' | 'FAILED';
  itemsProcessed?: number;
  errorCount?: number;
  errorMessage?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const log = await prisma.jobLog.findUnique({ where: { id: jobLogId }, select: { startedAt: true } });
  const now = new Date();
  const durationMs = log ? now.getTime() - log.startedAt.getTime() : null;

  await prisma.jobLog.update({
    where: { id: jobLogId },
    data: {
      status: params.status,
      completedAt: now,
      durationMs,
      ...(params.itemsProcessed !== undefined && { itemsProcessed: params.itemsProcessed }),
      ...(params.errorCount !== undefined && { errorCount: params.errorCount }),
      ...(params.errorMessage !== undefined && { errorMessage: params.errorMessage }),
      ...(params.metadata !== undefined && { metadata: params.metadata as Prisma.InputJsonValue }),
    },
  });
}
