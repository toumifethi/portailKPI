import { Router } from 'express';
import { requireAuth } from '@/auth/jwtMiddleware';
import { prisma } from '@/db/prisma';
import { resolveUserScope } from '@/auth/scopeResolver';
import type { AuthenticatedRequest } from '@/auth/jwtMiddleware';

const router = Router();

/**
 * GET /api/transitions
 * Query params: clientId, projectId, jiraKey, fromStatus, toStatus, assignee,
 *               issueType, periodStart, periodEnd, page (default 1), limit (default 50)
 */
router.get('/', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page ?? 1));
    const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 50)));

    const scope = await resolveUserScope(req);
    const allowedClientIds = scope.clientIds;

    // Restriction de perimetre
    const issueFilter: Record<string, unknown> = {};
    if (allowedClientIds !== null) {
      if (allowedClientIds.length === 0) {
        return res.json({ data: [], total: 0, page, limit });
      }
      issueFilter.clientId = { in: allowedClientIds };
    }

    // Filtre client explicite
    if (req.query.clientId) {
      const cid = Number(req.query.clientId);
      if (allowedClientIds !== null && !allowedClientIds.includes(cid)) {
        return res.status(403).json({ error: 'Access denied to this client' });
      }
      issueFilter.clientId = cid;
    }

    if (req.query.projectId) issueFilter.projectId = Number(req.query.projectId);

    if (req.query.jiraKey) {
      issueFilter.jiraKey = { contains: String(req.query.jiraKey).toUpperCase() };
    }

    if (req.query.assignee) {
      const ids = String(req.query.assignee).split(',').map((s) => s.trim()).filter(Boolean);
      issueFilter.assigneeJiraAccountId = ids.length === 1 ? ids[0] : { in: ids };
    }

    if (req.query.issueType) {
      const types = String(req.query.issueType).split(',').map((t) => t.trim()).filter(Boolean);
      issueFilter.issueType = types.length === 1 ? types[0] : { in: types };
    }

    // Dev/Viewer : forcer le filtre sur ses propres issues
    if (scope.jiraAccountIds !== null) {
      if (scope.jiraAccountIds.length === 0) {
        return res.json({ data: [], total: 0, page, limit });
      }
      issueFilter.assigneeJiraAccountId = { in: scope.jiraAccountIds };
    }

    // Build transition-level where
    const where: Record<string, unknown> = {};
    if (Object.keys(issueFilter).length > 0) {
      where.issue = issueFilter;
    }

    if (req.query.fromStatus) {
      const statuses = String(req.query.fromStatus).split(',').map((s) => s.trim()).filter(Boolean);
      where.fromStatus = statuses.length === 1 ? statuses[0] : { in: statuses };
    }

    if (req.query.toStatus) {
      const statuses = String(req.query.toStatus).split(',').map((s) => s.trim()).filter(Boolean);
      where.toStatus = statuses.length === 1 ? statuses[0] : { in: statuses };
    }

    if (req.query.periodStart || req.query.periodEnd) {
      const changedAt: Record<string, Date> = {};
      if (req.query.periodStart) changedAt.gte = new Date(String(req.query.periodStart));
      if (req.query.periodEnd) changedAt.lte = new Date(String(req.query.periodEnd));
      where.changedAt = changedAt;
    }

    const [total, transitions] = await Promise.all([
      prisma.issueTransition.count({ where }),
      prisma.issueTransition.findMany({
        where,
        select: {
          id: true,
          fromStatus: true,
          toStatus: true,
          changedAt: true,
          issue: {
            select: {
              jiraKey: true,
              summary: true,
              issueType: true,
              assigneeJiraAccountId: true,
              project: {
                select: {
                  jiraProjectName: true,
                  client: { select: { id: true, name: true } },
                },
              },
            },
          },
        },
        orderBy: { changedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    // Resolution des display names assignees
    const accountIds = [...new Set(
      transitions.map((t) => t.issue.assigneeJiraAccountId).filter(Boolean),
    )] as string[];
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
      data: transitions.map((t) => ({
        id: t.id,
        fromStatus: t.fromStatus,
        toStatus: t.toStatus,
        changedAt: t.changedAt,
        jiraKey: t.issue.jiraKey,
        summary: t.issue.summary,
        issueType: t.issue.issueType,
        projectName: t.issue.project.jiraProjectName,
        clientName: t.issue.project.client.name,
        assigneeDisplayName: t.issue.assigneeJiraAccountId
          ? (displayNameMap.get(t.issue.assigneeJiraAccountId) ?? t.issue.assigneeJiraAccountId)
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
 * GET /api/transitions/statuses
 * Retourne les valeurs distinctes de fromStatus et toStatus pour le client.
 */
router.get('/statuses', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const scope = await resolveUserScope(req);
    const issueFilter: Record<string, unknown> = {};

    if (scope.clientIds !== null) {
      if (scope.clientIds.length === 0) return res.json({ fromStatuses: [], toStatuses: [] });
      issueFilter.clientId = { in: scope.clientIds };
    }
    if (req.query.clientId) {
      const cid = Number(req.query.clientId);
      if (scope.clientIds !== null && !scope.clientIds.includes(cid)) {
        return res.status(403).json({ error: 'Access denied' });
      }
      issueFilter.clientId = cid;
    }

    const where: Record<string, unknown> = {};
    if (Object.keys(issueFilter).length > 0) {
      where.issue = issueFilter;
    }

    const [fromRows, toRows] = await Promise.all([
      prisma.issueTransition.findMany({
        where: { ...where, fromStatus: { not: null } },
        select: { fromStatus: true },
        distinct: ['fromStatus'],
        orderBy: { fromStatus: 'asc' },
      }),
      prisma.issueTransition.findMany({
        where,
        select: { toStatus: true },
        distinct: ['toStatus'],
        orderBy: { toStatus: 'asc' },
      }),
    ]);

    res.json({
      fromStatuses: fromRows.map((r) => r.fromStatus).filter(Boolean),
      toStatuses: toRows.map((r) => r.toStatus),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/transitions/statuses/by-jira-connection/:jiraConnectionId
 * Retourne les valeurs distinctes de fromStatus et toStatus pour une connexion JIRA.
 * Utile pour la configuration globale d'un KPI quand aucun client n'est encore cible.
 */
router.get('/statuses/by-jira-connection/:jiraConnectionId', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const jiraConnectionId = Number(req.params.jiraConnectionId);
    if (!Number.isInteger(jiraConnectionId) || jiraConnectionId <= 0) {
      return res.status(400).json({ error: 'Invalid jiraConnectionId' });
    }

    const scope = await resolveUserScope(req);

    const jiraConnection = await prisma.jiraConnection.findUnique({
      where: { id: jiraConnectionId },
      select: { id: true },
    });

    if (!jiraConnection) {
      return res.status(404).json({ error: 'JIRA connection not found' });
    }

    const issueFilter: Record<string, unknown> = {};

    if (scope.clientIds !== null) {
      if (scope.clientIds.length === 0) {
        return res.json({ fromStatuses: [], toStatuses: [] });
      }

      const accessibleClients = await prisma.client.findMany({
        where: {
          jiraConnectionId,
          id: { in: scope.clientIds },
        },
        select: { id: true },
      });

      if (accessibleClients.length === 0) {
        return res.status(403).json({ error: 'Access denied' });
      }

      issueFilter.clientId = { in: accessibleClients.map((client) => client.id) };
    } else {
      // Admin sans restriction de scope : on cherche tous les clients de la connexion
      const allConnectionClients = await prisma.client.findMany({
        where: { jiraConnectionId },
        select: { id: true },
      });
      if (allConnectionClients.length === 0) {
        return res.json({ fromStatuses: [], toStatuses: [] });
      }
      issueFilter.clientId = { in: allConnectionClients.map((client) => client.id) };
    }

    const where = { issue: issueFilter };

    const [fromRows, toRows] = await Promise.all([
      prisma.issueTransition.findMany({
        where: { ...where, fromStatus: { not: null } },
        select: { fromStatus: true },
        distinct: ['fromStatus'],
        orderBy: { fromStatus: 'asc' },
      }),
      prisma.issueTransition.findMany({
        where,
        select: { toStatus: true },
        distinct: ['toStatus'],
        orderBy: { toStatus: 'asc' },
      }),
    ]);

    return res.json({
      fromStatuses: fromRows.map((row) => row.fromStatus).filter(Boolean),
      toStatuses: toRows.map((row) => row.toStatus),
    });
  } catch (err) {
    return next(err);
  }
});

export default router;
