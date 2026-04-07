import { prisma } from '@/db/prisma';
import type { AuthenticatedRequest } from './jwtMiddleware';

const PROFILE_LEVELS: Record<string, number> = {
  ADMIN: 100,
  DELIVERY_MANAGER: 80,
  CHEF_DE_PROJET: 60,
  DEVELOPPEUR: 40,
  VIEWER: 20,
};

/**
 * Resout le scope d'acces d'un collaborateur selon son profil.
 *
 * - ADMIN (100) : aucune restriction
 * - DM/CP (60-80) : restreint aux clients via CollaboratorScope
 * - DEV/VIEWER (<60) : restreint a ses propres jiraAccountIds
 */
export interface UserScope {
  /** null = pas de restriction client */
  clientIds: number[] | null;
  /** null = pas de restriction assignee */
  jiraAccountIds: string[] | null;
  /** Niveau du profil */
  level: number;
}

export async function resolveUserScope(req: AuthenticatedRequest): Promise<UserScope> {
  const profileCode = req.user!.profile ?? req.user!.roles[0] ?? 'VIEWER';
  const level = PROFILE_LEVELS[profileCode] ?? 20;

  // Admin : aucune restriction
  if (level >= 100) {
    return { clientIds: null, jiraAccountIds: null, level };
  }

  // DM / CP : restreint aux clients via scopes
  const scopes = await prisma.collaboratorScope.findMany({
    where: { collaboratorId: req.user!.id, scopeType: 'CLIENT' },
    select: { scopeId: true },
  });
  const clientIds = scopes.length > 0 ? scopes.map((s) => s.scopeId) : null;

  // DEV / VIEWER : restreint a ses propres jiraAccountIds
  if (level < 60) {
    const jiraUsers = await prisma.jiraUser.findMany({
      where: { collaboratorId: req.user!.id },
      select: { jiraAccountId: true },
    });
    const jiraAccountIds = jiraUsers.map((ju) => ju.jiraAccountId);
    return { clientIds, jiraAccountIds: jiraAccountIds.length > 0 ? jiraAccountIds : [], level };
  }

  return { clientIds, jiraAccountIds: null, level };
}
