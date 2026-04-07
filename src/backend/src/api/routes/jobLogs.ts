import { Router } from 'express';
import { requireAuth } from '@/auth/jwtMiddleware';
import { adminOnly } from '@/auth/rbacMiddleware';
import { prisma } from '@/db/prisma';

const router = Router();

/**
 * GET /api/job-logs
 * Returns job execution logs with optional filters.
 * Query: jobType, clientId, limit (default 20), offset (default 0)
 * Admin only.
 */
router.get('/', requireAuth, adminOnly, async (req, res, next) => {
  try {
    const jobType = req.query.jobType ? String(req.query.jobType) : undefined;
    const clientId = req.query.clientId ? Number(req.query.clientId) : undefined;
    const limit = Math.min(Number(req.query.limit ?? 20), 100);
    const offset = Number(req.query.offset ?? 0);

    const where: Record<string, unknown> = {};
    if (jobType) where.jobType = jobType;
    if (clientId) where.clientId = clientId;

    const [logs, total] = await Promise.all([
      prisma.jobLog.findMany({
        where,
        include: {
          client: { select: { id: true, name: true } },
          kpiDefinition: { select: { id: true, name: true } },
        },
        orderBy: { startedAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.jobLog.count({ where }),
    ]);

    res.json({ data: logs, total, limit, offset });
  } catch (err) {
    next(err);
  }
});

export default router;
