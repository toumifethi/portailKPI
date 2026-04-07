import { Router } from 'express';
import { requireAuth } from '@/auth/jwtMiddleware';
import { adminOnly } from '@/auth/rbacMiddleware';
import { prisma } from '@/db/prisma';
import { computeNextRun } from '@/utils/cronNextRun';
import type { AuthenticatedRequest } from '@/auth/jwtMiddleware';

const router = Router();

/**
 * GET /api/kpi-calc-schedules?clientId=X
 */
router.get('/', requireAuth, adminOnly, async (req: AuthenticatedRequest, res, next) => {
  try {
    const clientId = req.query.clientId ? Number(req.query.clientId) : undefined;
    const schedules = await prisma.kpiCalcSchedule.findMany({
      where: clientId ? { clientId } : {},
      include: { client: { select: { id: true, name: true } }, kpiDefinition: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json(schedules);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/kpi-calc-schedules
 * Body: { clientId?, cronExpression, periodMode?, allClients? }
 */
router.post('/', requireAuth, adminOnly, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { clientId, kpiDefinitionId, cronExpression, periodMode, allClients } = req.body;
    if (!cronExpression) return res.status(400).json({ error: { code: 'MISSING_PARAMS', message: 'cronExpression is required' } });

    const schedule = await prisma.kpiCalcSchedule.create({
      data: {
        clientId: allClients ? null : (clientId ?? null),
        kpiDefinitionId: kpiDefinitionId ?? null,
        cronExpression,
        periodMode: periodMode ?? 'current_month',
        allClients: allClients ?? false,
        isActive: true,
        nextRunAt: computeNextRun(cronExpression),
      },
      include: { client: { select: { id: true, name: true } }, kpiDefinition: { select: { id: true, name: true } } },
    });
    res.status(201).json(schedule);
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/kpi-calc-schedules/:id
 */
router.patch('/:id', requireAuth, adminOnly, async (req: AuthenticatedRequest, res, next) => {
  try {
    const id = Number(req.params.id);
    const { cronExpression, isActive, periodMode, allClients, kpiDefinitionId } = req.body;

    const data: Record<string, unknown> = {};
    if (cronExpression !== undefined) {
      data.cronExpression = cronExpression;
      data.nextRunAt = computeNextRun(cronExpression);
    }
    if (isActive !== undefined) {
      data.isActive = isActive;
      if (!isActive) data.nextRunAt = null;
    }
    if (periodMode !== undefined) data.periodMode = periodMode;
    if (allClients !== undefined) data.allClients = allClients;
    if (kpiDefinitionId !== undefined) data.kpiDefinitionId = kpiDefinitionId;

    const updated = await prisma.kpiCalcSchedule.update({
      where: { id },
      data,
      include: { client: { select: { id: true, name: true } }, kpiDefinition: { select: { id: true, name: true } } },
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/kpi-calc-schedules/:id
 */
router.delete('/:id', requireAuth, adminOnly, async (req: AuthenticatedRequest, res, next) => {
  try {
    await prisma.kpiCalcSchedule.delete({ where: { id: Number(req.params.id) } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
