import cron from 'node-cron';
import { prisma } from '@/db/prisma';
import { scheduleImportJob } from '@/importer/importOrchestrator';
import { runKpiCalculationForClient } from '@/engine';
import { computeNextRun } from '@/utils/cronNextRun';
import { logger } from '@/utils/logger';
import { createJobLog, completeJobLog } from '@/services/jobLogger';

/**
 * Scheduler unifie : verifie toutes les minutes les planifications d'import ET de calcul KPI.
 */
export async function startScheduler(): Promise<void> {
  // Recalculer nextRunAt au demarrage
  const activeImports = await prisma.importSchedule.findMany({ where: { isActive: true } });
  for (const s of activeImports) {
    await prisma.importSchedule.update({ where: { id: s.id }, data: { nextRunAt: computeNextRun(s.cronExpression) } });
  }

  const activeKpiCalcs = await prisma.kpiCalcSchedule.findMany({ where: { isActive: true } });
  for (const s of activeKpiCalcs) {
    await prisma.kpiCalcSchedule.update({ where: { id: s.id }, data: { nextRunAt: computeNextRun(s.cronExpression) } });
  }

  if (activeImports.length + activeKpiCalcs.length > 0) {
    logger.info('Scheduler: recalculated nextRunAt', {
      imports: activeImports.length,
      kpiCalcs: activeKpiCalcs.length,
    });
  }

  logger.info('Scheduler started — checking every minute');

  cron.schedule('* * * * *', async () => {
    try {
      await checkAndRunImportSchedules();
      await checkAndRunKpiCalcSchedules();
    } catch (err) {
      logger.error('Scheduler tick error', { error: err instanceof Error ? err.message : String(err) });
    }
  });
}

// ── Helpers ──

function resolveImportPeriod(periodMode: string, now: Date): { start: Date; end: Date } {
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const start = new Date(tomorrow);
  switch (periodMode) {
    case '1_week': start.setDate(start.getDate() - 7); break;
    case '1_month': start.setDate(start.getDate() - 30); break;
    case '3_months': start.setDate(start.getDate() - 90); break;
    case '1_year': start.setDate(start.getDate() - 365); break;
    default: start.setDate(start.getDate() - 7); break;
  }
  return { start, end: tomorrow };
}

// ── Import schedules ──

async function checkAndRunImportSchedules(): Promise<void> {
  const now = new Date();

  const dueSchedules = await prisma.importSchedule.findMany({
    where: { isActive: true, nextRunAt: { lte: now } },
    include: { client: { select: { id: true, name: true, status: true } } },
  });

  for (const schedule of dueSchedules) {
    if (!schedule.client || schedule.client.status !== 'ACTIVE') {
      await prisma.importSchedule.update({
        where: { id: schedule.id },
        data: { nextRunAt: computeNextRun(schedule.cronExpression) },
      });
      continue;
    }

    const running = await prisma.importJob.findFirst({
      where: { clientId: schedule.clientId!, status: { in: ['PENDING', 'RUNNING'] } },
    });
    if (running) continue;

    const { start: periodStart, end: periodEnd } = resolveImportPeriod(schedule.periodMode, now);

    const jobLogId = await createJobLog({
      jobType: 'IMPORT',
      clientId: schedule.clientId!,
      triggeredBy: 'SCHEDULER',
      periodMode: schedule.periodMode,
      periodStart,
      periodEnd,
      scheduleId: schedule.id,
    });

    try {
      await scheduleImportJob(schedule.clientId!, 'SCHEDULED', periodStart, periodEnd);
      await completeJobLog(jobLogId, { status: 'COMPLETED', itemsProcessed: 0 });
      logger.info('Scheduler: import triggered', { scheduleId: schedule.id, clientName: schedule.client.name });
    } catch (err) {
      await completeJobLog(jobLogId, { status: 'FAILED', errorMessage: err instanceof Error ? err.message : String(err) });
      logger.error('Scheduler: import failed', { scheduleId: schedule.id, error: String(err) });
    }

    await prisma.importSchedule.update({
      where: { id: schedule.id },
      data: { lastRunAt: now, nextRunAt: computeNextRun(schedule.cronExpression) },
    });
  }
}

// ── KPI calc schedules ──

function resolvePeriod(periodMode: string): string | undefined {
  const now = new Date();
  switch (periodMode) {
    case 'current_month':
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    case 'previous_month': {
      const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`;
    }
    case 'last_3_months':
      // Pas de period unique — on retourne undefined pour recalculer les 13 derniers mois
      // (le moteur generera les periodes)
      return undefined;
    case 'all':
      return undefined;
    default:
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }
}

async function checkAndRunKpiCalcSchedules(): Promise<void> {
  const now = new Date();

  const dueSchedules = await prisma.kpiCalcSchedule.findMany({
    where: { isActive: true, nextRunAt: { lte: now } },
    include: { client: { select: { id: true, name: true, status: true } } },
  });

  for (const schedule of dueSchedules) {
    const period = resolvePeriod(schedule.periodMode);

    const jobLogId = await createJobLog({
      jobType: 'KPI_CALC',
      clientId: schedule.clientId ?? undefined,
      kpiDefinitionId: schedule.kpiDefinitionId ?? undefined,
      triggeredBy: 'SCHEDULER',
      periodMode: schedule.periodMode,
      scheduleId: schedule.id,
    });

    try {
      const kpiDefId = schedule.kpiDefinitionId ?? undefined;

      if (schedule.allClients) {
        const clients = await prisma.client.findMany({ where: { status: 'ACTIVE' }, select: { id: true, name: true } });
        for (const c of clients) {
          await runKpiCalculationForClient(c.id, period, kpiDefId);
        }
        await completeJobLog(jobLogId, { status: 'COMPLETED', itemsProcessed: clients.length });
        logger.info('Scheduler: KPI calc triggered for all clients', {
          scheduleId: schedule.id,
          clientCount: clients.length,
          periodMode: schedule.periodMode,
        });
      } else if (schedule.clientId && schedule.client?.status === 'ACTIVE') {
        await runKpiCalculationForClient(schedule.clientId, period, kpiDefId);
        await completeJobLog(jobLogId, { status: 'COMPLETED', itemsProcessed: 0 });
        logger.info('Scheduler: KPI calc triggered', {
          scheduleId: schedule.id,
          clientName: schedule.client.name,
          periodMode: schedule.periodMode,
        });
      } else {
        await completeJobLog(jobLogId, { status: 'COMPLETED', itemsProcessed: 0 });
      }
    } catch (err) {
      await completeJobLog(jobLogId, { status: 'FAILED', errorMessage: err instanceof Error ? err.message : String(err) });
      logger.error('Scheduler: KPI calc failed', { scheduleId: schedule.id, error: String(err) });
    }

    await prisma.kpiCalcSchedule.update({
      where: { id: schedule.id },
      data: { lastRunAt: now, nextRunAt: computeNextRun(schedule.cronExpression) },
    });
  }
}
