import { Router } from 'express';
import { requireAuth } from '@/auth/jwtMiddleware';
import { adminOnly } from '@/auth/rbacMiddleware';
import { prisma } from '@/db/prisma';
import { computeNextRun } from '@/utils/cronNextRun';
import type { AuthenticatedRequest } from '@/auth/jwtMiddleware';

const router = Router();

/**
 * GET /api/import-schedules?clientId=X
 * Liste les planifications d'import pour un client donné.
 */
router.get('/', requireAuth, adminOnly, async (req: AuthenticatedRequest, res, next) => {
  try {
    const clientId = req.query.clientId ? Number(req.query.clientId) : undefined;

    const schedules = await prisma.importSchedule.findMany({
      where: clientId ? { clientId } : {},
      include: { client: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });

    res.json(schedules);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/import-schedules
 * Crée une nouvelle planification.
 * Body: { clientId: number, cronExpression: string, isActive?: boolean }
 */
router.post('/', requireAuth, adminOnly, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { clientId, cronExpression, periodMode, isActive } = req.body;
    if (!clientId || !cronExpression) {
      return res.status(400).json({ error: { code: 'MISSING_PARAMS', message: 'clientId and cronExpression are required' } });
    }

    // Valider que le client existe
    const client = await prisma.client.findUnique({ where: { id: clientId } });
    if (!client) {
      return res.status(404).json({ error: { code: 'CLIENT_NOT_FOUND', message: 'Client not found' } });
    }

    // Valider la cron expression (basique)
    if (!isValidCron(cronExpression)) {
      return res.status(400).json({ error: { code: 'INVALID_CRON', message: 'Invalid cron expression' } });
    }

    const schedule = await prisma.importSchedule.create({
      data: {
        clientId,
        cronExpression,
        periodMode: periodMode ?? '1_week',
        isActive: isActive ?? true,
        nextRunAt: computeNextRun(cronExpression),
      },
      include: { client: { select: { id: true, name: true } } },
    });

    res.status(201).json(schedule);
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/import-schedules/:id
 * Met à jour une planification (cronExpression, isActive).
 */
router.patch('/:id', requireAuth, adminOnly, async (req: AuthenticatedRequest, res, next) => {
  try {
    const id = Number(req.params.id);
    const { cronExpression, isActive, periodMode } = req.body;

    const existing = await prisma.importSchedule.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Schedule not found' } });
    }

    const data: Record<string, unknown> = {};
    if (cronExpression !== undefined) {
      if (!isValidCron(cronExpression)) {
        return res.status(400).json({ error: { code: 'INVALID_CRON', message: 'Invalid cron expression' } });
      }
      data.cronExpression = cronExpression;
      data.nextRunAt = computeNextRun(cronExpression);
    }
    if (periodMode !== undefined) data.periodMode = periodMode;
    if (isActive !== undefined) {
      data.isActive = isActive;
      if (isActive && !cronExpression) {
        data.nextRunAt = computeNextRun(existing.cronExpression);
      }
      if (!isActive) {
        data.nextRunAt = null;
      }
    }

    const updated = await prisma.importSchedule.update({
      where: { id },
      data,
      include: { client: { select: { id: true, name: true } } },
    });

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/import-schedules/:id
 */
router.delete('/:id', requireAuth, adminOnly, async (req: AuthenticatedRequest, res, next) => {
  try {
    const id = Number(req.params.id);

    const existing = await prisma.importSchedule.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Schedule not found' } });
    }

    await prisma.importSchedule.delete({ where: { id } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ── Helpers ──

function isValidCron(expr: string): boolean {
  const parts = expr.trim().split(/\s+/);
  return parts.length === 5;
}

export default router;
