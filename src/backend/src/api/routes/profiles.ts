import { Router } from 'express';
import { requireAuth } from '@/auth/jwtMiddleware';
import { adminOnly } from '@/auth/rbacMiddleware';
import { prisma } from '@/db/prisma';
import { AppError } from '../middleware/errorHandler';
import { z } from 'zod';

const router = Router();

/**
 * GET /api/profiles
 * Liste tous les profils (accessible à tout utilisateur authentifié).
 */
router.get('/', requireAuth, async (_req, res, next) => {
  try {
    const profiles = await prisma.profile.findMany({
      orderBy: { level: 'asc' },
    });
    res.json(profiles);
  } catch (err) {
    next(err);
  }
});

const createProfileSchema = z.object({
  code: z.string().min(1).max(50),
  label: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  level: z.number().int().optional(),
});

/**
 * POST /api/profiles
 * Crée un nouveau profil (Admin uniquement).
 */
router.post('/', requireAuth, adminOnly, async (req, res, next) => {
  try {
    const body = createProfileSchema.parse(req.body);

    const existing = await prisma.profile.findUnique({ where: { code: body.code } });
    if (existing) {
      throw new AppError(409, `Profile with code "${body.code}" already exists`, 'DUPLICATE');
    }

    const profile = await prisma.profile.create({
      data: {
        code: body.code,
        label: body.label,
        description: body.description ?? null,
        level: body.level ?? 0,
      },
    });
    res.status(201).json(profile);
  } catch (err) {
    next(err);
  }
});

const updateProfileSchema = z.object({
  label: z.string().min(1).max(100).optional(),
  description: z.string().max(500).nullable().optional(),
  level: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

/**
 * PATCH /api/profiles/:id
 * Met à jour un profil (Admin uniquement).
 */
router.patch('/:id', requireAuth, adminOnly, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const body = updateProfileSchema.parse(req.body);

    const profile = await prisma.profile.update({
      where: { id },
      data: {
        ...(body.label !== undefined && { label: body.label }),
        ...(body.description !== undefined && { description: body.description }),
        ...(body.level !== undefined && { level: body.level }),
        ...(body.isActive !== undefined && { isActive: body.isActive }),
      },
    });
    res.json(profile);
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/profiles/:id
 * Supprime un profil (Admin uniquement).
 * Refuse si des collaborateurs sont liés.
 */
router.delete('/:id', requireAuth, adminOnly, async (req, res, next) => {
  try {
    const id = Number(req.params.id);

    const linkedCount = await prisma.collaborator.count({ where: { profileId: id } });
    if (linkedCount > 0) {
      throw new AppError(
        409,
        `Cannot delete profile: ${linkedCount} collaborator(s) are linked to it`,
        'HAS_DEPENDENCIES',
      );
    }

    await prisma.profile.delete({ where: { id } });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export default router;
