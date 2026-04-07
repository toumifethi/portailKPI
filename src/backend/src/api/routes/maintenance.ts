import { Router } from 'express';
import { requireAuth } from '@/auth/jwtMiddleware';
import { adminOnly } from '@/auth/rbacMiddleware';
import { prisma } from '@/db/prisma';
import { z } from 'zod';
import { logger } from '@/utils/logger';

const router = Router();

/**
 * POST /api/maintenance/purge/preview
 * Preview: count data that would be purged before the given date.
 * Body: { beforeDate: "YYYY-MM-DD", clientId?: number, types: ["worklogs","issues","kpi_results","job_logs"] }
 */
const purgeSchema = z.object({
  beforeDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  clientId: z.number().int().positive().optional(),
  types: z.array(z.enum(['worklogs', 'issues', 'kpi_results', 'job_logs'])).min(1),
});

router.post('/purge/preview', requireAuth, adminOnly, async (req, res, next) => {
  try {
    const body = purgeSchema.parse(req.body);
    const before = new Date(body.beforeDate);
    const clientFilter = body.clientId ? { clientId: body.clientId } : {};

    const counts: Record<string, number> = {};

    if (body.types.includes('worklogs')) {
      counts.worklogs = await prisma.worklog.count({
        where: {
          startedAt: { lt: before },
          ...(body.clientId ? { issue: { clientId: body.clientId } } : {}),
        },
      });
    }

    if (body.types.includes('issues')) {
      counts.issues = await prisma.issue.count({
        where: {
          jiraUpdatedAt: { lt: before },
          ...clientFilter,
        },
      });
    }

    if (body.types.includes('kpi_results')) {
      counts.kpiResults = await prisma.kpiResult.count({
        where: {
          periodStart: { lt: before },
          ...(body.clientId ? { kpiClientConfig: { clientId: body.clientId } } : {}),
        },
      });
    }

    if (body.types.includes('job_logs')) {
      counts.jobLogs = await prisma.jobLog.count({
        where: {
          startedAt: { lt: before },
          ...(body.clientId ? { clientId: body.clientId } : {}),
        },
      });
    }

    res.json({ beforeDate: body.beforeDate, clientId: body.clientId ?? null, counts });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/maintenance/purge/execute
 * Execute the purge. Same body as preview.
 */
router.post('/purge/execute', requireAuth, adminOnly, async (req, res, next) => {
  try {
    const body = purgeSchema.parse(req.body);
    const before = new Date(body.beforeDate);
    const clientFilter = body.clientId ? { clientId: body.clientId } : {};

    const deleted: Record<string, number> = {};

    if (body.types.includes('worklogs')) {
      const result = await prisma.worklog.deleteMany({
        where: {
          startedAt: { lt: before },
          ...(body.clientId ? { issue: { clientId: body.clientId } } : {}),
        },
      });
      deleted.worklogs = result.count;
    }

    if (body.types.includes('issues')) {
      // Delete related data first
      const issueIds = (await prisma.issue.findMany({
        where: { jiraUpdatedAt: { lt: before }, ...clientFilter },
        select: { id: true },
      })).map((i) => i.id);

      if (issueIds.length > 0) {
        await prisma.worklog.deleteMany({ where: { issueId: { in: issueIds } } });
        await prisma.issueSprint.deleteMany({ where: { issueId: { in: issueIds } } });
        await prisma.issueTransition.deleteMany({ where: { issueId: { in: issueIds } } });
      }
      const result = await prisma.issue.deleteMany({
        where: { jiraUpdatedAt: { lt: before }, ...clientFilter },
      });
      deleted.issues = result.count;
    }

    if (body.types.includes('kpi_results')) {
      const result = await prisma.kpiResult.deleteMany({
        where: {
          periodStart: { lt: before },
          ...(body.clientId ? { kpiClientConfig: { clientId: body.clientId } } : {}),
        },
      });
      deleted.kpiResults = result.count;
    }

    if (body.types.includes('job_logs')) {
      const result = await prisma.jobLog.deleteMany({
        where: {
          startedAt: { lt: before },
          ...(body.clientId ? { clientId: body.clientId } : {}),
        },
      });
      deleted.jobLogs = result.count;
    }

    logger.info('Data purge executed', { beforeDate: body.beforeDate, clientId: body.clientId, deleted });
    res.json({ ok: true, deleted });
  } catch (err) {
    next(err);
  }
});

export default router;
