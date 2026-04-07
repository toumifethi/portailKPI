import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';
import { config } from '@/config';
import { prisma } from '@/db/prisma';
import { logger } from '@/utils/logger';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: number;
    email: string;
    profile: string;
    roles: string[]; // compatibilité: [profile] pour les middlewares RBAC
    azureOid: string;
  };
}

const jwks = jwksClient({
  jwksUri: `https://login.microsoftonline.com/${config.AZURE_AD_TENANT_ID}/discovery/v2.0/keys`,
  cache: true,
  rateLimit: true,
  jwksRequestsPerMinute: 5,
});

function getSigningKey(header: jwt.JwtHeader, callback: jwt.SigningKeyCallback) {
  jwks.getSigningKey(header.kid, (err, key) => {
    if (err) return callback(err);
    callback(null, key?.getPublicKey());
  });
}

/**
 * Résolution du profil en mode dev :
 * 1. Si DEV_USER_EMAIL est défini → cherche le collaborateur en DB
 * 2. Si non trouvé → fallback sur DEV_PROFILE (virtuel, sans DB)
 */
async function resolveDevUser(req: AuthenticatedRequest, next: NextFunction) {
  // Priorité 1 : header X-Dev-User-Id (écran de connexion simulée)
  const devUserId = req.headers['x-dev-user-id'];
  if (devUserId) {
    try {
      const collab = await prisma.collaborator.findUnique({
        where: { id: Number(devUserId) },
        include: { profile: true },
      });
      if (collab && collab.status !== 'EXCLU') {
        req.user = {
          id: collab.id,
          email: collab.email,
          profile: collab.profile.code,
          roles: [collab.profile.code],
          azureOid: 'dev-oid',
        };
        return next();
      }
    } catch { /* fallthrough */ }
  }

  // Priorité 2 : DEV_USER_EMAIL (variable d'env)
  const email = config.DEV_USER_EMAIL;
  if (email) {
    try {
      const collab = await prisma.collaborator.findUnique({
        where: { email: email.toLowerCase() },
        include: { profile: true },
      });

      if (collab && collab.status !== 'EXCLU') {
        req.user = {
          id: collab.id,
          email: collab.email,
          profile: collab.profile.code,
          roles: [collab.profile.code],
          azureOid: 'dev-oid',
        };
        return next();
      }
    } catch (err) {
      logger.error('Dev auth: DB lookup failed', { error: err });
    }
  }

  // Fallback : profil virtuel basé sur DEV_PROFILE
  const role = config.DEV_PROFILE;
  req.user = {
    id: 0,
    email: email ?? `dev-${role.toLowerCase()}@dev.local`,
    profile: role,
    roles: [role],
    azureOid: 'dev-oid',
  };
  logger.debug('Dev auth: using fallback profile', { role });
  next();
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (config.AUTH_MODE === 'dev') {
    return resolveDevUser(req, next);
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }

  const token = authHeader.slice(7);

  jwt.verify(
    token,
    getSigningKey,
    {
      audience: config.AZURE_AD_AUDIENCE ?? config.AZURE_AD_CLIENT_ID,
      issuer: `https://login.microsoftonline.com/${config.AZURE_AD_TENANT_ID}/v2.0`,
      algorithms: ['RS256'],
    },
    async (err, decoded) => {
      if (err || !decoded || typeof decoded === 'string') {
        logger.warn('JWT validation failed', { error: err?.message });
        return res.status(401).json({ error: 'Invalid or expired token' });
      }

      const payload = decoded as jwt.JwtPayload;
      const email: string = payload.preferred_username ?? payload.upn ?? payload.email;
      const azureOid: string = payload.oid;

      if (!email) {
        return res.status(401).json({ error: 'Token missing email claim' });
      }

      try {
        const collab = await prisma.collaborator.findUnique({
          where: { email: email.toLowerCase() },
          include: { profile: true },
        });

        if (!collab || collab.status === 'EXCLU') {
          return res.status(403).json({ error: 'Account not authorized or excluded' });
        }

        // Mettre à jour azureAdOid si pas encore enregistré
        if (!collab.azureAdOid && azureOid) {
          await prisma.collaborator.update({
            where: { id: collab.id },
            data: { azureAdOid: azureOid },
          });
        }

        req.user = {
          id: collab.id,
          email: collab.email,
          profile: collab.profile.code,
          roles: [collab.profile.code],
          azureOid,
        };

        next();
      } catch (dbErr) {
        logger.error('Auth DB lookup failed', { error: dbErr });
        return res.status(500).json({ error: 'Internal server error' });
      }
    },
  );
}
