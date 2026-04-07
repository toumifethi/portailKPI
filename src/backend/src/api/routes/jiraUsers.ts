import { Router } from 'express';
import { requireAuth } from '@/auth/jwtMiddleware';
import { adminOnly } from '@/auth/rbacMiddleware';
import { prisma } from '@/db/prisma';
import { AppError } from '../middleware/errorHandler';
import { z } from 'zod';

const router = Router();

/**
 * GET /api/jira-users
 * Liste les jira users. Si clientId est fourni, filtre par connexion JIRA du client.
 * Sans clientId, retourne tous les jira users (pour les dropdowns de filtres).
 */
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const clientId = req.query.clientId ? Number(req.query.clientId) : null;

    let where: Record<string, unknown> = {};

    if (clientId) {
      const client = await prisma.client.findUniqueOrThrow({
        where: { id: clientId },
        select: { jiraConnectionId: true },
      });

      if (!client.jiraConnectionId) {
        return res.json([]);
      }

      where = { jiraConnectionId: client.jiraConnectionId };
    }

    const jiraUsers = await prisma.jiraUser.findMany({
      where,
      orderBy: { displayName: 'asc' },
      include: {
        collaborator: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        jiraConnection: { select: { id: true, name: true } },
      },
    });

    res.json(jiraUsers);
  } catch (err) {
    next(err);
  }
});

const updateJiraUserSchema = z.object({
  collaboratorId: z.number().int().positive().nullable().optional(),
  isActive: z.boolean().optional(),
  displayName: z.string().min(1).max(255).optional(),
  emailAddress: z.string().max(255).nullable().optional(),
});

/**
 * PATCH /api/jira-users/:id
 * Met à jour un jira user (link collaborator, actif/inactif, displayName, email).
 * Admin uniquement.
 */
router.patch('/:id', requireAuth, adminOnly, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const body = updateJiraUserSchema.parse(req.body);

    const updated = await prisma.jiraUser.update({
      where: { id },
      data: {
        ...(body.collaboratorId !== undefined && { collaboratorId: body.collaboratorId }),
        ...(body.isActive !== undefined && { isActive: body.isActive }),
        ...(body.displayName !== undefined && { displayName: body.displayName }),
        ...(body.emailAddress !== undefined && { emailAddress: body.emailAddress }),
      },
      include: {
        collaborator: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

export default router;
