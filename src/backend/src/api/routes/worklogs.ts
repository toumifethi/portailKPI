import { Router } from 'express';
import { requireAuth } from '@/auth/jwtMiddleware';
import { prisma } from '@/db/prisma';
import { resolveUserScope } from '@/auth/scopeResolver';
import type { AuthenticatedRequest } from '@/auth/jwtMiddleware';

const router = Router();

/**
 * GET /api/worklogs
 * Scope automatique selon le profil :
 * - Admin : tout
 * - DM/CP : clients rattaches
 * - Dev/Viewer : uniquement ses worklogs (auteur)
 */
router.get('/', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page ?? 1));
    const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 50)));

    const scope = await resolveUserScope(req);
    const allowedClientIds = scope.clientIds;

    const issueWhere: Record<string, unknown> = {};

    if (allowedClientIds !== null) {
      if (allowedClientIds.length === 0) {
        return res.json({ data: [], total: 0, page, limit });
      }
      issueWhere.clientId = { in: allowedClientIds };
    }

    if (req.query.clientId) {
      const cid = Number(req.query.clientId);
      if (allowedClientIds !== null && !allowedClientIds.includes(cid)) {
        return res.status(403).json({ error: 'Access denied to this client' });
      }
      issueWhere.clientId = cid;
    }

    const where: Record<string, unknown> = { issue: issueWhere };

    if (req.query.authorAccountId) {
      const ids = String(req.query.authorAccountId).split(',').map((s) => s.trim()).filter(Boolean);
      where.authorJiraAccountId = ids.length === 1 ? ids[0] : { in: ids };
    }

    // Dev/Viewer : forcer le filtre sur ses propres worklogs
    if (scope.jiraAccountIds !== null) {
      if (scope.jiraAccountIds.length === 0) {
        return res.json({ data: [], total: 0, page, limit });
      }
      where.authorJiraAccountId = { in: scope.jiraAccountIds };
    }

    if (req.query.periodStart || req.query.periodEnd) {
      const startedAt: Record<string, Date> = {};
      if (req.query.periodStart) startedAt.gte = new Date(String(req.query.periodStart));
      if (req.query.periodEnd) startedAt.lte = new Date(String(req.query.periodEnd));
      where.startedAt = startedAt;
    }

    const [total, worklogs] = await Promise.all([
      prisma.worklog.count({ where }),
      prisma.worklog.findMany({
        where,
        select: {
          id: true,
          authorJiraAccountId: true,
          timeSpentSeconds: true,
          startedAt: true,
          source: true,
          jiraWorklogId: true,
          tempoWorklogId: true,
          issue: {
            select: {
              jiraKey: true,
              summary: true,
              project: {
                select: {
                  jiraProjectName: true,
                  client: { select: { id: true, name: true } },
                },
              },
            },
          },
        },
        orderBy: { startedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    // Résolution des display names auteurs via jira_users → collaborator
    const accountIds = [...new Set(worklogs.map((w) => w.authorJiraAccountId))] as string[];
    const jiraUserRows = accountIds.length > 0
      ? await prisma.jiraUser.findMany({
          where: { jiraAccountId: { in: accountIds } },
          select: {
            jiraAccountId: true,
            displayName: true,
            collaborator: { select: { firstName: true, lastName: true } },
          },
        })
      : [];
    const displayNameMap = new Map(
      jiraUserRows.map((ju) => [
        ju.jiraAccountId,
        ju.collaborator
          ? `${ju.collaborator.firstName} ${ju.collaborator.lastName}`.trim()
          : ju.displayName ?? ju.jiraAccountId,
      ]),
    );

    res.json({
      data: worklogs.map((w) => ({
        ...w,
        authorDisplayName: displayNameMap.get(w.authorJiraAccountId) ?? w.authorJiraAccountId,
      })),
      total,
      page,
      limit,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
