import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './jwtMiddleware';

type AppRole = 'ADMIN' | 'DELIVERY_MANAGER' | 'CHEF_DE_PROJET' | 'DEVELOPPEUR';

/**
 * Middleware RBAC — autorise uniquement les rôles listés.
 * Usage : router.get('/admin/...', requireAuth, requireRole('ADMIN'), handler)
 */
export function requireRole(...roles: AppRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const hasRole = roles.some((r) => req.user!.roles.includes(r));
    if (!hasRole) {
      return res.status(403).json({
        error: 'Insufficient permissions',
        required: roles,
        current: req.user.roles,
      });
    }

    next();
  };
}

/** Raccourci : Admin uniquement */
export const adminOnly = requireRole('ADMIN');

/** Raccourci : Admin ou Delivery Manager */
export const adminOrDm = requireRole('ADMIN', 'DELIVERY_MANAGER');

/** Raccourci : Admin, DM ou Chef de projet */
export const managerAndAbove = requireRole('ADMIN', 'DELIVERY_MANAGER', 'CHEF_DE_PROJET');
