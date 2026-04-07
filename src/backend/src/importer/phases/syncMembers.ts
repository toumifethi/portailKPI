import { prisma } from '@/db/prisma';
import { JiraClient, JiraUserInfo } from '../jiraClient';
import { AssigneeInfo } from './syncIssues';
import { logger } from '@/utils/logger';

/**
 * Phase 2 : synchronise les auteurs/assignees JIRA → tables `jira_users` + `collaborators`.
 *
 * Pour chaque compte JIRA :
 *   1. UPSERT dans jira_users (unique sur jiraAccountId + jiraConnectionId)
 *   2. Auto-linking vers un collaborateur :
 *      a. Par email si disponible
 *      b. Par firstName + lastName
 *      c. Sinon création d'un nouveau collaborateur (ACTIF, VIEWER)
 *   3. Met à jour collaboratorId sur le jira_user
 *
 * Sources d'emails (par priorité) :
 *   1. assignee.emailAddress collecté pendant syncIssues
 *   2. author.emailAddress collecté pendant syncWorklogs (JIRA natif)
 *   3. GET /user/bulk pour les accountIds sans email (1 appel par tranche de 10)
 */
export async function syncMembers(
  jiraClient: JiraClient,
  clientId: number,
  jiraConnectionId: number,
  projectIds: number[],
  assigneesFromIssues: Map<string, AssigneeInfo>,
  authorsFromWorklogs: Map<string, JiraUserInfo>,
): Promise<{ imported: number; linked: number; created: number }> {
  // Tous les accountIds distincts en base pour ce périmètre
  const rows = await prisma.issue.findMany({
    where: { clientId, projectId: { in: projectIds }, assigneeJiraAccountId: { not: null } },
    select: { assigneeJiraAccountId: true },
    distinct: ['assigneeJiraAccountId'],
  });

  // Construction de la map fusionnée : issues + worklogs
  const merged = new Map<string, { displayName: string; emailAddress?: string }>();

  for (const row of rows) {
    const id = row.assigneeJiraAccountId!;
    const fromIssue = assigneesFromIssues.get(id);
    const fromWorklog = authorsFromWorklogs.get(id);
    merged.set(id, {
      displayName: fromIssue?.displayName ?? fromWorklog?.displayName ?? id,
      emailAddress: fromIssue?.emailAddress ?? fromWorklog?.emailAddress,
    });
  }

  // Ajouter aussi les auteurs de worklogs qui ne sont pas assignees d'issues
  for (const [id, info] of authorsFromWorklogs) {
    if (!merged.has(id)) {
      merged.set(id, { displayName: info.displayName, emailAddress: info.emailAddress });
    }
  }

  // Batch getUserBulk pour les accountIds sans email
  const missingEmail = [...merged.entries()]
    .filter(([, v]) => !v.emailAddress)
    .map(([id]) => id);

  if (missingEmail.length > 0) {
    logger.info('syncMembers: fetching emails via bulk API', { count: missingEmail.length });
    const bulkResults = await jiraClient.getUserBulk(missingEmail);
    for (const u of bulkResults) {
      if (u.emailAddress) {
        const existing = merged.get(u.accountId);
        if (existing) {
          merged.set(u.accountId, { ...existing, emailAddress: u.emailAddress, displayName: u.displayName || existing.displayName });
        }
      }
    }
  }

  let imported = 0;
  let linked = 0;
  let created = 0;

  for (const [accountId, info] of merged) {
    const nameParts = info.displayName.trim().split(/\s+/);
    const firstName = nameParts[0] ?? accountId;
    const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '—';
    const email = info.emailAddress?.toLowerCase().trim() ?? undefined;

    try {
      // 1. UPSERT into jira_users (unique on jiraAccountId + jiraConnectionId)
      const jiraUser = await prisma.jiraUser.upsert({
        where: {
          jiraAccountId_jiraConnectionId: {
            jiraAccountId: accountId,
            jiraConnectionId,
          },
        },
        create: {
          jiraAccountId: accountId,
          jiraConnectionId,
          displayName: info.displayName,
          emailAddress: email ?? null,
          isActive: true,
        },
        update: {
          displayName: info.displayName,
          emailAddress: email ?? undefined,
          // isActive n'est PAS ecrase : valeur geree manuellement par l'admin
        },
      });
      imported++;

      // 2. Auto-link to a collaborator
      let collaborator = null;

      // a. Try to find by email
      if (email) {
        collaborator = await prisma.collaborator.findFirst({
          where: { email },
        });
      }

      // b. Try to find by firstName + lastName
      if (!collaborator) {
        collaborator = await prisma.collaborator.findFirst({
          where: { firstName, lastName },
        });
      }

      if (collaborator) {
        linked++;
      } else {
        // c. Create a new collaborator
        const viewerProfile = await prisma.profile.findFirst({ where: { code: 'VIEWER' } });
        if (!viewerProfile) {
          logger.warn('syncMembers: VIEWER profile not found, skipping collaborator creation', { accountId });
          continue;
        }
        const placeholderEmail = `${accountId}@jira.local`;
        collaborator = await prisma.collaborator.create({
          data: {
            email: email ?? placeholderEmail,
            firstName,
            lastName,
            profileId: viewerProfile.id,
            status: 'ACTIF',
          },
        });
        created++;
      }

      // d. Set collaboratorId on the jira_user only if not already set (preserve manual overrides)
      if (!jiraUser.collaboratorId) {
        await prisma.jiraUser.update({
          where: { id: jiraUser.id },
          data: { collaboratorId: collaborator.id },
        });
      }
    } catch (err) {
      logger.warn('syncMembers: upsert/link failed', { accountId, email, err: String(err) });
    }
  }

  logger.info('syncMembers: completed', { clientId, imported, linked, created, total: merged.size });
  return { imported, linked, created };
}
