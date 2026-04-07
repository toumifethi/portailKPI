import { Router } from 'express';
import { requireAuth } from '@/auth/jwtMiddleware';
import { adminOnly, managerAndAbove } from '@/auth/rbacMiddleware';
import { prisma } from '@/db/prisma';
import { scheduleImportJob } from '@/importer/importOrchestrator';
import { AppError } from '../middleware/errorHandler';
import { createJobLog, completeJobLog } from '@/services/jobLogger';

const router = Router();

/**
 * GET /api/imports
 * Historique des imports pour un client.
 * Query: clientId, limit (default 20)
 */
router.get('/', requireAuth, managerAndAbove, async (req, res, next) => {
  try {
    const clientId = Number(req.query.clientId);
    const limit = Number(req.query.limit ?? 20);

    if (!clientId) throw new AppError(400, 'clientId is required', 'MISSING_PARAMS');

    const jobs = await prisma.importJob.findMany({
      where: { clientId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    res.json(jobs);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/imports/trigger
 * Déclenche manuellement un import pour un client.
 * Body: { clientId, periodStart?, periodEnd?, jql? }
 * Admin uniquement.
 */
router.post('/trigger', requireAuth, adminOnly, async (req, res, next) => {
  try {
    const { clientId, periodStart, periodEnd, jql } = req.body as {
      clientId: number;
      periodStart?: string;
      periodEnd?: string;
      jql?: string;
    };

    if (!clientId) throw new AppError(400, 'clientId is required', 'MISSING_PARAMS');

    // Par défaut : mois en cours
    const now = new Date();
    const start = periodStart
      ? new Date(periodStart)
      : new Date(now.getFullYear(), now.getMonth(), 1);
    const end = periodEnd
      ? new Date(periodEnd)
      : new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    const effectiveJql = jql || undefined;

    const jobLogId = await createJobLog({
      jobType: 'IMPORT',
      clientId,
      triggeredBy: 'MANUAL',
      periodStart: start,
      periodEnd: end,
    });

    try {
      const importJobId = await scheduleImportJob(clientId, 'INCREMENTAL', start, end, effectiveJql);
      // Le job log reste RUNNING — sera completé par l'orchestrateur
      await prisma.jobLog.update({ where: { id: jobLogId }, data: { metadata: { importJobId } as any } });
      res.status(202).json({ importJobId, status: 'PENDING', jobLogId });
    } catch (err) {
      await completeJobLog(jobLogId, { status: 'FAILED', errorMessage: err instanceof Error ? err.message : String(err) });
      throw err;
    }
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/imports/:id/retry
 * Relance un job d'import FAILED avec les mêmes paramètres.
 * Admin uniquement.
 */
router.post('/:id/retry', requireAuth, adminOnly, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const job = await prisma.importJob.findUniqueOrThrow({ where: { id } });

    if (job.status !== 'FAILED') {
      throw new AppError(400, 'Seuls les jobs FAILED peuvent être relancés', 'INVALID_STATUS');
    }

    const periodStart = job.fromDate ?? new Date();
    const periodEnd = new Date(periodStart.getFullYear(), periodStart.getMonth() + 1, 0, 23, 59, 59);

    const importJobId = await scheduleImportJob(
      job.clientId,
      'INCREMENTAL',
      periodStart,
      periodEnd,
    );

    res.status(202).json({ importJobId, status: 'PENDING' });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/imports/:id
 * Détail d'un job d'import.
 */
router.get('/:id', requireAuth, managerAndAbove, async (req, res, next) => {
  try {
    const id = Number(req.params.id);

    const job = await prisma.importJob.findUniqueOrThrow({
      where: { id },
      include: { errors: { orderBy: { createdAt: 'asc' } } },
    });
    res.json(job);
  } catch (err) {
    next(err);
  }
});

export default router;
