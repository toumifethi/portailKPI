import { Router } from 'express';
import { requireAuth } from '@/auth/jwtMiddleware';
import { prisma } from '@/db/prisma';
import { resolveUserScope } from '@/auth/scopeResolver';
import type { AuthenticatedRequest } from '@/auth/jwtMiddleware';

const router = Router();

/**
 * Retourne les clientIds accessibles au collaborateur :
 * - null  → Admin, aucune restriction
 * - []    → aucune scope configurée, aucun accès
 * - [...]  → IDs des clients autorisés via CollaboratorScope
 */
/**
 * GET /api/issues
 * Query params: clientId, projectId, status, issueType, assigneeAccountId, jiraKey,
 *               periodStart, periodEnd, page (default 1), limit (default 50)
 * Scope automatique selon le profil :
 * - Admin : tout
 * - DM/CP : clients rattaches
 * - Dev/Viewer : uniquement ses issues (assignee)
 */
router.get('/', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page ?? 1));
    const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 50)));

    const scope = await resolveUserScope(req);
    const allowedClientIds = scope.clientIds;

    // Restriction de périmètre
    const clientFilter: { in?: number[]; equals?: number } = {};
    if (allowedClientIds !== null) {
      if (allowedClientIds.length === 0) {
        return res.json({ data: [], total: 0, page, limit });
      }
      clientFilter.in = allowedClientIds;
    }

    // Filtre client explicite
    if (req.query.clientId) {
      const cid = Number(req.query.clientId);
      if (allowedClientIds !== null && !allowedClientIds.includes(cid)) {
        return res.status(403).json({ error: 'Access denied to this client' });
      }
      clientFilter.equals = cid;
      delete clientFilter.in;
    }

    const where: Record<string, unknown> = {};
    if (clientFilter.equals !== undefined) {
      where.clientId = clientFilter.equals;
    } else if (clientFilter.in !== undefined) {
      where.clientId = { in: clientFilter.in };
    }

    if (req.query.projectId) where.projectId = Number(req.query.projectId);
    if (req.query.status) {
      const statuses = String(req.query.status).split(',').map((s) => s.trim()).filter(Boolean);
      where.status = statuses.length === 1 ? statuses[0] : { in: statuses };
    }
    // issueType supporte un ou plusieurs types séparés par virgule (ex: "Story,Bug,Task")
    if (req.query.issueType) {
      const types = String(req.query.issueType).split(',').map((t) => t.trim()).filter(Boolean);
      if (types.length === 1) {
        where.issueType = types[0];
      } else if (types.length > 1) {
        where.issueType = { in: types };
      }
    }
    if (req.query.assigneeAccountId) {
      const ids = String(req.query.assigneeAccountId).split(',').map((s) => s.trim()).filter(Boolean);
      where.assigneeJiraAccountId = ids.length === 1 ? ids[0] : { in: ids };
    }

    // Dev/Viewer : forcer le filtre sur ses propres issues
    if (scope.jiraAccountIds !== null) {
      if (scope.jiraAccountIds.length === 0) {
        return res.json({ data: [], total: 0, page, limit });
      }
      where.assigneeJiraAccountId = { in: scope.jiraAccountIds };
    }

    if (req.query.jiraKey) {
      where.jiraKey = { contains: String(req.query.jiraKey).toUpperCase() };
    }

    if (req.query.periodStart || req.query.periodEnd) {
      const updatedAt: Record<string, Date> = {};
      if (req.query.periodStart) updatedAt.gte = new Date(String(req.query.periodStart));
      if (req.query.periodEnd) updatedAt.lte = new Date(String(req.query.periodEnd));
      where.jiraUpdatedAt = updatedAt;
    }

    const [total, issues] = await Promise.all([
      prisma.issue.count({ where }),
      prisma.issue.findMany({
        where,
        select: {
          id: true,
          clientId: true,
          projectId: true,
          jiraKey: true,
          summary: true,
          issueType: true,
          status: true,
          assigneeJiraAccountId: true,
          originalEstimateHours: true,
          timeSpentSeconds: true,
          rollupEstimateHours: true,
          rollupTimeSpentSeconds: true,
          rollupTimeSpentHours: true,
          rollupRemainingHours: true,
          storyPoints: true,
          jiraCreatedAt: true,
          jiraUpdatedAt: true,
          resolvedAt: true,
          project: {
            select: {
              jiraProjectKey: true,
              jiraProjectName: true,
              client: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: { jiraUpdatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    // Résolution des display names assignees via jira_users → collaborator
    const accountIds = [...new Set(issues.map((i) => i.assigneeJiraAccountId).filter(Boolean))] as string[];
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
      data: issues.map((i) => ({
        ...i,
        originalEstimateHours: i.originalEstimateHours !== null ? Number(i.originalEstimateHours) : null,
        rollupEstimateHours: i.rollupEstimateHours !== null ? Number(i.rollupEstimateHours) : null,
        rollupTimeSpentHours: i.rollupTimeSpentHours !== null ? Number(i.rollupTimeSpentHours) : null,
        rollupRemainingHours: i.rollupRemainingHours !== null ? Number(i.rollupRemainingHours) : null,
        storyPoints: i.storyPoints !== null ? Number(i.storyPoints) : null,
        assigneeDisplayName: i.assigneeJiraAccountId
          ? (displayNameMap.get(i.assigneeJiraAccountId) ?? i.assigneeJiraAccountId)
          : null,
      })),
      total,
      page,
      limit,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/issues/types
 * Retourne la liste des types d'issues distincts en base.
 */
router.get('/types', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const scope = await resolveUserScope(req);
    const where: Record<string, unknown> = {};
    if (scope.clientIds !== null) {
      if (scope.clientIds.length === 0) return res.json([]);
      where.clientId = { in: scope.clientIds };
    }

    const rows = await prisma.issue.findMany({
      where,
      select: { issueType: true },
      distinct: ['issueType'],
      orderBy: { issueType: 'asc' },
    });

    res.json(rows.map((r) => r.issueType));
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/issues/statuses
 * Retourne la liste des statuts distincts en base.
 */
router.get('/statuses', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const scope = await resolveUserScope(req);
    const where: Record<string, unknown> = {};
    if (scope.clientIds !== null) {
      if (scope.clientIds.length === 0) return res.json([]);
      where.clientId = { in: scope.clientIds };
    }

    const rows = await prisma.issue.findMany({
      where,
      select: { status: true },
      distinct: ['status'],
      orderBy: { status: 'asc' },
    });

    res.json(rows.map((r) => r.status));
  } catch (err) {
    next(err);
  }
});

export default router;
