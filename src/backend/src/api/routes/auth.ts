import { Router } from 'express';
import { requireAuth } from '@/auth/jwtMiddleware';
import { prisma } from '@/db/prisma';
import { config } from '@/config';

const router = Router();

/**
 * GET /api/auth/me
 * Retourne le profil de l'utilisateur authentifié.
 */
router.get('/me', requireAuth, (req, res) => {
  res.json({
    id: req.user!.id,
    email: req.user!.email,
    profile: req.user!.profile,
    roles: req.user!.roles,
  });
});

/**
 * GET /api/auth/dev-users
 * Liste les collaborateurs disponibles pour la connexion simulée (mode dev uniquement).
 */
router.get('/dev-users', async (_req, res, next) => {
  try {
    if (config.AUTH_MODE !== 'dev') {
      return res.status(403).json({ error: 'Only available in dev mode' });
    }

    const collaborators = await prisma.collaborator.findMany({
      where: { status: 'ACTIF' },
      include: { profile: { select: { id: true, code: true, label: true, level: true } } },
      orderBy: [{ profile: { level: 'desc' } }, { firstName: 'asc' }],
    });

    res.json(collaborators.map((c) => ({
      id: c.id,
      email: c.email,
      firstName: c.firstName,
      lastName: c.lastName,
      profile: c.profile,
    })));
  } catch (err) {
    next(err);
  }
});

export default router;
