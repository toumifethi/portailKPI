import { Router } from 'express';
import { requireAuth } from '@/auth/jwtMiddleware';
import { prisma } from '@/db/prisma';
import { resolveUserScope } from '@/auth/scopeResolver';
import type { AuthenticatedRequest } from '@/auth/jwtMiddleware';

const router = Router();

router.get('/matrix', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const scope = await resolveUserScope(req);
    const allowedClientIds = scope.clientIds;

    const issueWhere: Record<string, unknown> = {};

    if (req.query.clientId) {
      const cid = Number(req.query.clientId);
      if (allowedClientIds !== null && !allowedClientIds.includes(cid)) {
        return res.status(403).json({ error: 'Access denied' });
      }
      issueWhere.clientId = cid;
    } else if (allowedClientIds !== null) {
      if (allowedClientIds.length === 0) return res.json({ matrix: [], issueTypes: [], linkTypes: [] });
      issueWhere.clientId = { in: allowedClientIds };
    }

    if (req.query.projectId) issueWhere.projectId = Number(req.query.projectId);
    if (req.query.assigneeAccountId) issueWhere.assigneeJiraAccountId = String(req.query.assigneeAccountId);

    // Period filter on source issue
    if (req.query.periodStart || req.query.periodEnd) {
      const updatedAt: Record<string, Date> = {};
      if (req.query.periodStart) updatedAt.gte = new Date(String(req.query.periodStart));
      if (req.query.periodEnd) updatedAt.lte = new Date(String(req.query.periodEnd));
      issueWhere.jiraUpdatedAt = updatedAt;
    }

    // Get all links with source issue matching filters
    const links = await prisma.issueLink.findMany({
      where: {
        sourceIssue: issueWhere,
      },
      select: {
        linkType: true,
        sourceIssue: { select: { issueType: true } },
      },
    });

    // Build matrix
    const matrixMap = new Map<string, number>();
    const issueTypesSet = new Set<string>();
    const linkTypesSet = new Set<string>();

    for (const link of links) {
      const issueType = link.sourceIssue.issueType;
      const linkType = link.linkType;
      const key = `${issueType}||${linkType}`;
      matrixMap.set(key, (matrixMap.get(key) ?? 0) + 1);
      issueTypesSet.add(issueType);
      linkTypesSet.add(linkType);
    }

    const matrix = [...matrixMap.entries()].map(([key, count]) => {
      const [issueType, linkType] = key.split('||');
      return { issueType, linkType, count };
    });

    res.json({
      matrix,
      issueTypes: [...issueTypesSet].sort(),
      linkTypes: [...linkTypesSet].sort(),
    });
  } catch (err) { next(err); }
});

// 2. GET /api/issue-links/detail?issueType=Story&linkType=Bug+attaché&clientId=1&...
// Returns the actual linked issues for a specific cell
router.get('/detail', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const scope = await resolveUserScope(req);
    const allowedClientIds = scope.clientIds;

    const issueWhere: Record<string, unknown> = {};

    if (req.query.clientId) {
      const cid = Number(req.query.clientId);
      if (allowedClientIds !== null && !allowedClientIds.includes(cid)) {
        return res.status(403).json({ error: 'Access denied' });
      }
      issueWhere.clientId = cid;
    } else if (allowedClientIds !== null) {
      if (allowedClientIds.length === 0) return res.json([]);
      issueWhere.clientId = { in: allowedClientIds };
    }

    if (req.query.projectId) issueWhere.projectId = Number(req.query.projectId);
    if (req.query.assigneeAccountId) issueWhere.assigneeJiraAccountId = String(req.query.assigneeAccountId);
    if (req.query.issueType) issueWhere.issueType = String(req.query.issueType);

    if (req.query.periodStart || req.query.periodEnd) {
      const updatedAt: Record<string, Date> = {};
      if (req.query.periodStart) updatedAt.gte = new Date(String(req.query.periodStart));
      if (req.query.periodEnd) updatedAt.lte = new Date(String(req.query.periodEnd));
      issueWhere.jiraUpdatedAt = updatedAt;
    }

    const linkType = req.query.linkType ? String(req.query.linkType) : undefined;

    const links = await prisma.issueLink.findMany({
      where: {
        sourceIssue: issueWhere,
        ...(linkType ? { linkType } : {}),
      },
      select: {
        id: true,
        linkType: true,
        sourceIssue: {
          select: {
            jiraKey: true,
            summary: true,
            issueType: true,
            status: true,
            assigneeJiraAccountId: true,
          },
        },
        targetIssue: {
          select: {
            jiraKey: true,
            summary: true,
            issueType: true,
            status: true,
            assigneeJiraAccountId: true,
          },
        },
      },
      take: 200,
    });

    // Resolve assignee display names
    const accountIds = new Set<string>();
    for (const l of links) {
      if (l.sourceIssue.assigneeJiraAccountId) accountIds.add(l.sourceIssue.assigneeJiraAccountId);
      if (l.targetIssue.assigneeJiraAccountId) accountIds.add(l.targetIssue.assigneeJiraAccountId);
    }

    const jiraUsers = accountIds.size > 0
      ? await prisma.jiraUser.findMany({
          where: { jiraAccountId: { in: [...accountIds] } },
          select: { jiraAccountId: true, displayName: true },
        })
      : [];
    const nameMap = new Map(jiraUsers.map(u => [u.jiraAccountId, u.displayName]));

    const result = links.map(l => ({
      id: l.id,
      linkType: l.linkType,
      source: {
        jiraKey: l.sourceIssue.jiraKey,
        summary: l.sourceIssue.summary,
        issueType: l.sourceIssue.issueType,
        status: l.sourceIssue.status,
        assignee: nameMap.get(l.sourceIssue.assigneeJiraAccountId ?? '') ?? l.sourceIssue.assigneeJiraAccountId,
      },
      target: {
        jiraKey: l.targetIssue.jiraKey,
        summary: l.targetIssue.summary,
        issueType: l.targetIssue.issueType,
        status: l.targetIssue.status,
        assignee: nameMap.get(l.targetIssue.assigneeJiraAccountId ?? '') ?? l.targetIssue.assigneeJiraAccountId,
      },
    }));

    res.json(result);
  } catch (err) { next(err); }
});

/**
 * GET /api/issue-links/returns-summary
 * Pour chaque ticket principal (cible des liens), compte et liste les retours liés.
 * Query: clientId (required), linkTypes (CSV, required), periodStart, periodEnd, projectId, assigneeAccountId, page, limit
 */
router.get('/returns-summary', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const scope = await resolveUserScope(req);
    const clientId = Number(req.query.clientId);
    if (!clientId) return res.status(400).json({ error: 'clientId required' });
    if (scope.clientIds !== null && !scope.clientIds.includes(clientId)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const linkTypesRaw = req.query.linkTypes ? String(req.query.linkTypes) : '';
    const linkTypes = linkTypesRaw.split(',').map(s => s.trim()).filter(Boolean);
    if (linkTypes.length === 0) return res.json({ data: [], total: 0, page: 1, limit: 50, linkTypes: [] });

    const page = Math.max(1, Number(req.query.page ?? 1));
    const limit = Math.min(200, Math.max(1, Number(req.query.limit ?? 50)));

    // Build WHERE for main tickets (targets of selected link types)
    const linkTypeConditions = linkTypes.map(lt => ({ linkType: lt }));
    const issueWhere: Record<string, unknown> = {
      clientId,
      targetLinks: {
        some: { OR: linkTypeConditions },
      },
    };

    if (req.query.projectId) issueWhere.projectId = Number(req.query.projectId);
    if (req.query.assigneeAccountId) issueWhere.assigneeJiraAccountId = String(req.query.assigneeAccountId);

    // Filtre par types d'issues du ticket principal
    if (req.query.issueTypes) {
      const types = String(req.query.issueTypes).split(',').map(s => s.trim()).filter(Boolean);
      if (types.length > 0) issueWhere.issueType = { in: types };
    }

    if (req.query.periodStart || req.query.periodEnd) {
      const dateFilter: Record<string, Date> = {};
      if (req.query.periodStart) dateFilter.gte = new Date(String(req.query.periodStart));
      if (req.query.periodEnd) dateFilter.lte = new Date(String(req.query.periodEnd));
      issueWhere.jiraUpdatedAt = dateFilter;
    }

    if (scope.jiraAccountIds) {
      issueWhere.assigneeJiraAccountId = { in: scope.jiraAccountIds };
    }

    const [total, mainTickets] = await Promise.all([
      prisma.issue.count({ where: issueWhere }),
      prisma.issue.findMany({
        where: issueWhere,
        select: {
          id: true,
          jiraKey: true,
          summary: true,
          issueType: true,
          status: true,
          assigneeJiraAccountId: true,
          targetLinks: {
            where: { OR: linkTypeConditions },
            select: {
              linkType: true,
              sourceIssue: {
                select: {
                  id: true,
                  jiraKey: true,
                  summary: true,
                  issueType: true,
                  status: true,
                  assigneeJiraAccountId: true,
                  rollupEstimateHours: true,
                  rollupTimeSpentHours: true,
                  rollupRemainingHours: true,
                },
              },
            },
          },
        },
        orderBy: { jiraKey: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    // Resolve assignee names (tickets principaux + issues liees)
    const accountIds = new Set<string>();
    for (const t of mainTickets) {
      if (t.assigneeJiraAccountId) accountIds.add(t.assigneeJiraAccountId);
      for (const l of t.targetLinks) {
        if (l.sourceIssue.assigneeJiraAccountId) accountIds.add(l.sourceIssue.assigneeJiraAccountId);
      }
    }
    const jiraUsers = accountIds.size > 0
      ? await prisma.jiraUser.findMany({
          where: { jiraAccountId: { in: [...accountIds] } },
          select: { jiraAccountId: true, displayName: true },
        })
      : [];
    const nameMap = new Map(jiraUsers.map(u => [u.jiraAccountId, u.displayName]));

    const data = mainTickets.map(t => ({
      id: t.id,
      jiraKey: t.jiraKey,
      summary: t.summary,
      issueType: t.issueType,
      status: t.status,
      assignee: nameMap.get(t.assigneeJiraAccountId ?? '') ?? t.assigneeJiraAccountId,
      nbLinked: t.targetLinks.length,
      linkedIssues: t.targetLinks.map(l => ({
        linkType: l.linkType,
        issueId: l.sourceIssue.id,
        jiraKey: l.sourceIssue.jiraKey,
        summary: l.sourceIssue.summary,
        issueType: l.sourceIssue.issueType,
        status: l.sourceIssue.status,
        assignee: nameMap.get(l.sourceIssue.assigneeJiraAccountId ?? '') ?? l.sourceIssue.assigneeJiraAccountId,
        estimateHours: l.sourceIssue.rollupEstimateHours ? Number(l.sourceIssue.rollupEstimateHours) : null,
        timeSpentHours: l.sourceIssue.rollupTimeSpentHours ? Number(l.sourceIssue.rollupTimeSpentHours) : null,
        remainingHours: l.sourceIssue.rollupRemainingHours ? Number(l.sourceIssue.rollupRemainingHours) : null,
      })),
    }));

    res.json({ data, total, page, limit, linkTypes });
  } catch (err) { next(err); }
});

/**
 * GET /api/issue-links/returns-detail?issueId=123&clientId=1
 * Returns the list of return tickets linked to a given dev ticket.
 */
router.get('/returns-detail', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const issueId = Number(req.query.issueId);
    if (!issueId) return res.status(400).json({ error: 'issueId required' });

    const scope = await resolveUserScope(req);
    const issue = await prisma.issue.findUnique({
      where: { id: issueId },
      select: { clientId: true },
    });
    if (!issue) return res.status(404).json({ error: 'Issue not found' });
    if (scope.clientIds !== null && !scope.clientIds.includes(issue.clientId)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get return link type from client config
    const client = await prisma.client.findUnique({
      where: { id: issue.clientId },
      select: {
        returnInternalIssueTypes: true,
        returnClientIssueTypes: true,
        jiraConnection: { select: { fieldMapping: true } },
      },
    });
    const fieldMapping = (client?.jiraConnection?.fieldMapping as Record<string, unknown>) ?? {};
    const returnLinkType = (fieldMapping.returnLinkType as string) ?? 'est un retour de';
    const internalTypes = (client?.returnInternalIssueTypes as string[]) ?? [];
    const clientTypes = (client?.returnClientIssueTypes as string[]) ?? [];

    const links = await prisma.issueLink.findMany({
      where: {
        targetIssueId: issueId,
        linkType: { contains: returnLinkType },
      },
      select: {
        id: true,
        linkType: true,
        sourceIssue: {
          select: {
            id: true,
            jiraKey: true,
            summary: true,
            issueType: true,
            status: true,
            assigneeJiraAccountId: true,
            rollupTimeSpentHours: true,
          },
        },
      },
    });

    // Resolve names
    const accountIds = new Set<string>();
    for (const l of links) {
      if (l.sourceIssue.assigneeJiraAccountId) accountIds.add(l.sourceIssue.assigneeJiraAccountId);
    }
    const jiraUsers = accountIds.size > 0
      ? await prisma.jiraUser.findMany({
          where: { jiraAccountId: { in: [...accountIds] } },
          select: { jiraAccountId: true, displayName: true },
        })
      : [];
    const nameMap = new Map(jiraUsers.map(u => [u.jiraAccountId, u.displayName]));

    const result = links.map(l => {
      const returnType = internalTypes.includes(l.sourceIssue.issueType)
        ? 'interne'
        : clientTypes.includes(l.sourceIssue.issueType)
          ? 'client'
          : 'autre';

      return {
        id: l.sourceIssue.id,
        jiraKey: l.sourceIssue.jiraKey,
        summary: l.sourceIssue.summary,
        issueType: l.sourceIssue.issueType,
        status: l.sourceIssue.status,
        assignee: nameMap.get(l.sourceIssue.assigneeJiraAccountId ?? '') ?? l.sourceIssue.assigneeJiraAccountId,
        timeSpentHours: l.sourceIssue.rollupTimeSpentHours ? Number(l.sourceIssue.rollupTimeSpentHours) : null,
        returnCategory: returnType,
      };
    });

    res.json(result);
  } catch (err) { next(err); }
});

export default router;
