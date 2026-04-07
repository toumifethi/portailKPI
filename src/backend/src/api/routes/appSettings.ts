import { Router } from 'express';
import { requireAuth } from '@/auth/jwtMiddleware';
import { adminOnly } from '@/auth/rbacMiddleware';
import { prisma } from '@/db/prisma';
import { z } from 'zod';

const router = Router();

/**
 * GET /api/settings
 * Retourne tous les parametres applicatifs.
 * Admin uniquement.
 */
router.get('/', requireAuth, adminOnly, async (_req, res, next) => {
  try {
    const settings = await prisma.appSetting.findMany({
      orderBy: { key: 'asc' },
    });
    res.json(settings);
  } catch (err) {
    next(err);
  }
});

const updateSchema = z.object({
  value: z.string().max(500),
  description: z.string().max(500).optional(),
});

/**
 * PATCH /api/settings/:key
 * Met a jour (ou cree) un parametre applicatif.
 * Admin uniquement.
 */
router.patch('/:key', requireAuth, adminOnly, async (req, res, next) => {
  try {
    const key = req.params.key;
    const body = updateSchema.parse(req.body);

    const setting = await prisma.appSetting.upsert({
      where: { key },
      update: {
        value: body.value,
        ...(body.description !== undefined ? { description: body.description } : {}),
      },
      create: {
        key,
        value: body.value,
        description: body.description ?? null,
      },
    });

    res.json(setting);
  } catch (err) {
    next(err);
  }
});

export default router;
