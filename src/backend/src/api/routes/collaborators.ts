import { Router } from 'express';
import { requireAuth } from '@/auth/jwtMiddleware';
import { adminOnly, managerAndAbove } from '@/auth/rbacMiddleware';
import { prisma } from '@/db/prisma';
import { AppError } from '../middleware/errorHandler';
import { z } from 'zod';

const router = Router();

/**
 * GET /api/collaborators
 * Liste des collaborateurs (Manager et au-dessus).
 */
router.get('/', requireAuth, managerAndAbove, async (req, res, next) => {
  try {
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const clientId = req.query.clientId ? Number(req.query.clientId) : undefined;

    // Si clientId fourni, ne retourner que les collaborateurs liés via jira_users
    let collaboratorIds: number[] | undefined;
    if (clientId) {
      const jiraUsers = await prisma.jiraUser.findMany({
        where: {
          jiraConnection: { clients: { some: { id: clientId } } },
          collaboratorId: { not: null },
          isActive: true,
        },
        select: { collaboratorId: true },
        distinct: ['collaboratorId'],
      });
      collaboratorIds = jiraUsers.map((ju) => ju.collaboratorId).filter((id): id is number => id !== null);
    }

    const where: Record<string, unknown> = {};
    if (search) {
      where.OR = [
        { firstName: { contains: search } },
        { lastName: { contains: search } },
      ];
    }
    if (collaboratorIds) {
      where.id = { in: collaboratorIds };
    }

    const collaborators = await prisma.collaborator.findMany({
      where,
      orderBy: { lastName: 'asc' },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        profileId: true,
        profile: { select: { id: true, code: true, label: true } },
        status: true,
        createdAt: true,
      },
    });
    res.json(collaborators);
  } catch (err) {
    next(err);
  }
});

const createCollaboratorSchema = z.object({
  email: z.string().email().max(255),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  profileId: z.number().int().positive(),
});

/**
 * POST /api/collaborators
 * Crée un nouveau collaborateur.
 */
router.post('/', requireAuth, adminOnly, async (req, res, next) => {
  try {
    const body = createCollaboratorSchema.parse(req.body);
    const created = await prisma.collaborator.create({
      data: {
        email: body.email.toLowerCase(),
        firstName: body.firstName,
        lastName: body.lastName,
        profileId: body.profileId,
        status: 'ACTIF',
      },
      include: { profile: { select: { id: true, code: true, label: true } } },
    });
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

const updateCollaboratorSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  email: z.string().email().max(255).optional(),
  status: z.enum(['ACTIF', 'INACTIF', 'EXCLU']).optional(),
  profileId: z.number().int().positive().optional(),
});

/**
 * PATCH /api/collaborators/:id
 * Met à jour un collaborateur.
 */
router.patch('/:id', requireAuth, adminOnly, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const body = updateCollaboratorSchema.parse(req.body);

    const data: Record<string, unknown> = {};
    if (body.firstName !== undefined) data.firstName = body.firstName;
    if (body.lastName !== undefined) data.lastName = body.lastName;
    if (body.email !== undefined) data.email = body.email.toLowerCase();
    if (body.status !== undefined) data.status = body.status;
    if (body.profileId !== undefined) data.profileId = body.profileId;

    const updated = await prisma.collaborator.update({
      where: { id },
      data,
      include: { profile: { select: { id: true, code: true, label: true } } },
    });

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/collaborators/:id/clients
 * Associe un collaborateur à un client via CollaboratorScope.
 */
router.post('/:id/clients', requireAuth, adminOnly, async (req, res, next) => {
  try {
    const collaboratorId = Number(req.params.id);
    const { clientId } = req.body as { clientId: number };

    if (!clientId) throw new AppError(400, 'clientId is required', 'MISSING_PARAMS');

    // Vérifie si la scope existe déjà
    const existing = await prisma.collaboratorScope.findFirst({
      where: { collaboratorId, scopeType: 'CLIENT', scopeId: clientId },
    });
    if (!existing) {
      await prisma.collaboratorScope.create({
        data: { collaboratorId, scopeType: 'CLIENT', scopeId: clientId },
      });
    }

    res.status(201).json({ collaboratorId, clientId });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/collaborators/:id/clients/:clientId
 * Supprime l'association collaborateur-client.
 */
router.delete('/:id/clients/:clientId', requireAuth, adminOnly, async (req, res, next) => {
  try {
    const collaboratorId = Number(req.params.id);
    const clientId = Number(req.params.clientId);

    await prisma.collaboratorScope.deleteMany({
      where: { collaboratorId, scopeType: 'CLIENT', scopeId: clientId },
    });

    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export default router;
