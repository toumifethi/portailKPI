import { Router } from 'express';
import { requireAuth } from '@/auth/jwtMiddleware';
import { adminOnly, managerAndAbove } from '@/auth/rbacMiddleware';
import { prisma } from '@/db/prisma';
import { JiraClient, JiraFieldInfo } from '@/importer/jiraClient';
import { logger } from '@/utils/logger';
import { AppError } from '../middleware/errorHandler';
import { z } from 'zod';

const router = Router();

/**
 * GET /api/clients
 * Liste les clients actifs selon le rôle.
 */
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const user = req.user!;
    const isAdmin = user.roles.includes('ADMIN');
    const isDm = user.roles.includes('DM');

    const includeArchived = req.query.includeArchived === 'true';
    const clients = await prisma.client.findMany({
      where: includeArchived ? {} : { status: { not: 'ARCHIVED' } },
      orderBy: { name: 'asc' },
      select: {
        id: true, name: true, status: true,
        jiraConnectionId: true,
        returnInternalIssueTypes: true,
        returnClientIssueTypes: true,
        importTransitions: true,
        createdAt: true, updatedAt: true,
      },
    });

    const filtered = isAdmin || isDm
      ? clients
      : clients; // TODO: filtrer sur CollaboratorScope quand implémenté

    res.json(filtered);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/clients/:id
 * Détail d'un client avec ses projets et sa connexion JIRA.
 */
router.get('/:id', requireAuth, managerAndAbove, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const client = await prisma.client.findUniqueOrThrow({
      where: { id },
      include: { projects: true, jiraConnection: true },
    });
    res.json(client);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/clients/:id/jira-fields
 * Retourne les champs JIRA utilisés dans les projets du client (pour sélection des extraJiraFields).
 */
router.get('/:id/jira-fields', requireAuth, managerAndAbove, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const client = await prisma.client.findUniqueOrThrow({
      where: { id },
      include: {
        jiraConnection: true,
        projects: { where: { status: 'ACTIVE' } },
      },
    });

    if (!client.jiraConnection) throw new AppError(400, 'Aucune connexion JIRA configurée', 'NO_JIRA_CONNECTION');
    if (!client.projects.length) throw new AppError(400, 'Aucun projet actif configuré', 'NO_PROJECTS');

    const jiraClient = new JiraClient(
      client.jiraConnection.jiraUrl,
      client.jiraConnection.jiraEmail,
      client.jiraConnection.jiraApiToken,
    );

    // Agréger les champs de tous les projets actifs, dédupliquer par id
    const fieldMap = new Map<string, JiraFieldInfo>();
    for (const project of client.projects) {
      const fields = await jiraClient.getProjectFields(project.jiraProjectKey);
      for (const f of fields) {
        if (!fieldMap.has(f.id)) fieldMap.set(f.id, f);
      }
    }

    const result = Array.from(fieldMap.values()).sort((a, b) => {
      if (a.custom !== b.custom) return a.custom ? 1 : -1;
      return a.name.localeCompare(b.name);
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/clients/:id/issue-types
 * Retourne l'union des types d'issues des projets actifs du client.
 */
router.get('/:id/issue-types', requireAuth, managerAndAbove, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const client = await prisma.client.findUniqueOrThrow({
      where: { id },
      include: {
        jiraConnection: true,
        projects: { where: { status: 'ACTIVE' } },
      },
    });

    if (!client.jiraConnection) throw new AppError(400, 'Aucune connexion JIRA configurée', 'NO_JIRA_CONNECTION');

    if (!client.projects.length) {
      return res.json({
        issueTypes: [],
        hasProjects: false,
        message: 'Aucun projet actif associé. Ajoutez un projet JIRA pour configurer les types de retour.',
      });
    }

    const jiraClient = new JiraClient(
      client.jiraConnection.jiraUrl,
      client.jiraConnection.jiraEmail,
      client.jiraConnection.jiraApiToken,
    );

    const perProjectTypes = await Promise.all(
      client.projects.map(async (project) => {
        try {
          const projectIssueTypes = await jiraClient.getProjectIssueTypes(project.jiraProjectKey);
          logger.info('Client issue types by project', {
            clientId: client.id,
            clientName: client.name,
            projectKey: project.jiraProjectKey,
            issueTypesCount: projectIssueTypes.length,
            issueTypesSample: projectIssueTypes.slice(0, 20),
          });
          return projectIssueTypes;
        } catch {
          // Projet non accessible sur la connexion courante: on ignore ce projet.
          logger.warn('Project issue types fetch failed', {
            clientId: client.id,
            clientName: client.name,
            projectKey: project.jiraProjectKey,
          });
          return [];
        }
      }),
    );

    const issueTypes = Array.from(new Set(perProjectTypes.flat()))
      .sort((a, b) => a.localeCompare(b));

    logger.info('Client issue types union', {
      clientId: client.id,
      clientName: client.name,
      projectsCount: client.projects.length,
      issueTypesCount: issueTypes.length,
      issueTypesSample: issueTypes.slice(0, 30),
    });

    res.json({ issueTypes, hasProjects: true, message: null });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/clients/:id/custom-fields
 * Retourne les champs custom JIRA depuis la DB (synchronisés à l'import).
 * Inclut les options pour les champs de type select/multi-select.
 */
router.get('/:id/custom-fields', requireAuth, managerAndAbove, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const client = await prisma.client.findUniqueOrThrow({
      where: { id },
      select: { jiraConnectionId: true },
    });

    if (!client.jiraConnectionId) {
      return res.json([]);
    }

    const fields = await prisma.jiraCustomField.findMany({
      where: { jiraConnectionId: client.jiraConnectionId, isActive: true },
      include: {
        options: {
          where: { isActive: true },
          orderBy: { position: 'asc' },
        },
      },
      orderBy: { name: 'asc' },
    });

    res.json(fields.map((f) => ({
      id: f.jiraFieldId,
      name: f.name,
      fieldType: f.fieldType,
      schemaType: f.schemaType,
      options: f.options.map((o) => ({
        id: o.jiraOptionId,
        value: o.value,
      })),
    })));
  } catch (err) {
    next(err);
  }
});

const createClientSchema = z.object({
  name: z.string().min(1).max(200),
  jiraConnectionId: z.number().int().positive(),
  returnInternalIssueTypes: z.array(z.string().max(200)).nullable().optional(),
  returnClientIssueTypes: z.array(z.string().max(200)).nullable().optional(),
  importTransitions: z.boolean().optional(),
});

/**
 * POST /api/clients
 * Crée un nouveau client lié à une JiraConnection existante (Admin uniquement).
 */
router.post('/', requireAuth, adminOnly, async (req, res, next) => {
  try {
    const body = createClientSchema.parse(req.body);

    // Vérifier que la connexion existe
    await prisma.jiraConnection.findUniqueOrThrow({ where: { id: body.jiraConnectionId } });

    const client = await prisma.client.create({
      data: {
        name: body.name,
        jiraConnectionId: body.jiraConnectionId,
        status: 'ACTIVE',
        groupingType: 'EPIC',
        returnInternalIssueTypes: body.returnInternalIssueTypes ?? undefined,
        returnClientIssueTypes: body.returnClientIssueTypes ?? undefined,
        importTransitions: body.importTransitions ?? false,
      },
    });

    res.status(201).json(client);
  } catch (err) {
    next(err);
  }
});

const updateClientSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  jiraConnectionId: z.number().int().positive().optional(),
  extraJiraFields: z.array(z.string().max(100)).nullable().optional(),
  returnInternalIssueTypes: z.array(z.string().max(200)).nullable().optional(),
  returnClientIssueTypes: z.array(z.string().max(200)).nullable().optional(),
  importTransitions: z.boolean().optional(),
});

/**
 * PATCH /api/clients/:id
 * Met à jour les informations d'un client (Admin uniquement).
 */
router.patch('/:id', requireAuth, adminOnly, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const body = updateClientSchema.parse(req.body);

    const data: Record<string, unknown> = {};
    if (body.name !== undefined) data.name = body.name;
    if (body.jiraConnectionId !== undefined) data.jiraConnectionId = body.jiraConnectionId;
    if (body.extraJiraFields !== undefined) data.extraJiraFields = body.extraJiraFields;
    if (body.returnInternalIssueTypes !== undefined) data.returnInternalIssueTypes = body.returnInternalIssueTypes;
    if (body.returnClientIssueTypes !== undefined) data.returnClientIssueTypes = body.returnClientIssueTypes;
    if (body.importTransitions !== undefined) data.importTransitions = body.importTransitions;

    const updated = await prisma.client.update({ where: { id }, data });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/clients/:id
 * Supprime définitivement un client archivé et toutes ses données.
 * Admin uniquement.
 */
router.delete('/:id', requireAuth, adminOnly, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const client = await prisma.client.findUniqueOrThrow({ where: { id } });

    if (client.status !== 'ARCHIVED') {
      throw new AppError(400, 'Seuls les clients archivés peuvent être supprimés. Archivez le client d\'abord.', 'NOT_ARCHIVED');
    }

    // Suppression en cascade manuelle (ordre des dépendances)
    const projectIds = (await prisma.project.findMany({ where: { clientId: id }, select: { id: true } })).map((p) => p.id);

    // Worklogs → issues → projects
    if (projectIds.length > 0) {
      await prisma.worklog.deleteMany({ where: { issue: { clientId: id } } });
      await prisma.issueSprint.deleteMany({ where: { issue: { clientId: id } } });
      await prisma.issueTransition.deleteMany({ where: { issue: { clientId: id } } });
    }
    await prisma.issue.deleteMany({ where: { clientId: id } });
    await prisma.groupingEntity.deleteMany({ where: { projectId: { in: projectIds } } });

    // KPI results → configs
    const configIds = (await prisma.kpiClientConfig.findMany({ where: { clientId: id }, select: { id: true } })).map((c) => c.id);
    if (configIds.length > 0) {
      await prisma.kpiResult.deleteMany({ where: { kpiClientConfigId: { in: configIds } } });
      await prisma.kpiFormulaVersion.deleteMany({ where: { kpiClientConfigId: { in: configIds } } });
      await prisma.kpiAiFieldRule.deleteMany({ where: { kpiClientConfigId: { in: configIds } } });
    }
    await prisma.kpiClientConfig.deleteMany({ where: { clientId: id } });

    // Jobs & schedules
    const importJobIds = (await prisma.importJob.findMany({ where: { clientId: id }, select: { id: true } })).map((j) => j.id);
    if (importJobIds.length > 0) {
      await prisma.importError.deleteMany({ where: { importJobId: { in: importJobIds } } });
    }
    await prisma.importJob.deleteMany({ where: { clientId: id } });
    await prisma.importSchedule.deleteMany({ where: { clientId: id } });
    await prisma.kpiCalcSchedule.deleteMany({ where: { clientId: id } });
    await prisma.jobLog.updateMany({ where: { clientId: id }, data: { clientId: null } });

    // Projects & client
    await prisma.project.deleteMany({ where: { clientId: id } });
    await prisma.client.delete({ where: { id } });

    res.json({ ok: true, message: `Client "${client.name}" et toutes ses données supprimés définitivement.` });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/clients/:id/test-connection
 * Teste la connexion JIRA d'un client existant.
 */
router.post('/:id/test-connection', requireAuth, managerAndAbove, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const client = await prisma.client.findUniqueOrThrow({
      where: { id },
      include: { jiraConnection: true },
    });

    if (!client.jiraConnection) {
      throw new AppError(400, 'Ce client n\'a pas de connexion JIRA configurée.', 'NO_JIRA_CONNECTION');
    }

    const jiraClient = new JiraClient(
      client.jiraConnection.jiraUrl,
      client.jiraConnection.jiraEmail,
      client.jiraConnection.jiraApiToken,
    );
    const result = await jiraClient.testConnection();
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/clients/:id/archive
 * Archive un client (Admin uniquement).
 */
router.patch('/:id/archive', requireAuth, adminOnly, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { reason } = req.body as { reason?: string };

    const updated = await prisma.client.update({
      where: { id },
      data: {
        status: 'ARCHIVED',
        archivedAt: new Date(),
        archiveReason: reason ?? null,
        archivedByCollaboratorId: req.user!.id,
      },
    });

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/clients/:id/projects
 * Liste les projets actifs d'un client.
 */
router.get('/:id/projects', requireAuth, managerAndAbove, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const projects = await prisma.project.findMany({
      where: { clientId: id, status: 'ACTIVE' },
      orderBy: { jiraProjectKey: 'asc' },
    });
    res.json(projects);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/clients/:id/jira-projects
 * Retourne la liste des projets disponibles sur l'instance JIRA du client.
 * Admin uniquement.
 */
router.get('/:id/jira-projects', requireAuth, adminOnly, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const client = await prisma.client.findUniqueOrThrow({
      where: { id },
      include: { jiraConnection: true },
    });

    if (!client.jiraConnection) {
      throw new AppError(400, 'Ce client n\'a pas de connexion JIRA configurée.', 'NO_JIRA_CONNECTION');
    }

    const jiraClient = new JiraClient(
      client.jiraConnection.jiraUrl,
      client.jiraConnection.jiraEmail,
      client.jiraConnection.jiraApiToken,
    );
    const projects = await jiraClient.getProjects();
    const result = projects.map((p: { id: string; key: string; name: string; projectTypeKey: string }) => ({
      id: p.id,
      key: p.key,
      name: p.name,
      projectTypeKey: p.projectTypeKey,
    }));
    res.json(result);
  } catch (err) {
    next(err);
  }
});

const addProjectSchema = z.object({
  jiraProjectKey: z.string().min(1),
  jiraProjectName: z.string().min(1),
  importFromDate: z.string().optional(),
  jiraProjectType: z.enum(['CLASSIC', 'NEXT_GEN']).default('CLASSIC'),
});

/**
 * POST /api/clients/:id/projects
 * Ajoute ou réactive un projet JIRA pour un client.
 * Admin uniquement.
 */
router.post('/:id/projects', requireAuth, adminOnly, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const body = addProjectSchema.parse(req.body);
    const { jiraProjectKey, jiraProjectName, importFromDate, jiraProjectType } = body;

    const project = await prisma.project.upsert({
      where: { clientId_jiraProjectKey: { clientId: id, jiraProjectKey } },
      create: {
        clientId: id,
        jiraProjectKey,
        jiraProjectName,
        jiraProjectType,
        importFromDate: importFromDate ? new Date(importFromDate) : null,
        status: 'ACTIVE',
      },
      update: {
        jiraProjectName,
        importFromDate: importFromDate ? new Date(importFromDate) : undefined,
        status: 'ACTIVE',
      },
    });

    res.status(201).json(project);
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/clients/:id/projects/:projectKey
 * Archive un projet (ne supprime pas les données).
 * Admin uniquement.
 */
router.delete('/:id/projects/:projectKey', requireAuth, adminOnly, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const projectKey = req.params.projectKey;

    await prisma.project.updateMany({
      where: { clientId: id, jiraProjectKey: projectKey },
      data: { status: 'ARCHIVED' },
    });

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
