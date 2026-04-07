import { Router } from 'express';
import { requireAuth } from '@/auth/jwtMiddleware';
import { adminOnly } from '@/auth/rbacMiddleware';
import { prisma } from '@/db/prisma';
import { JiraClient } from '@/importer/jiraClient';
import { syncCustomFields } from '@/importer/phases/syncCustomFields';
import { logger } from '@/utils/logger';
import { AppError } from '../middleware/errorHandler';
import { z } from 'zod';

const router = Router();

const fieldMappingSchema = z.object({
  storyPoints: z.string().optional(),
  sprints: z.string().optional(),
}).optional();

const connectionSchema = z.object({
  name: z.string().min(1).max(200),
  jiraUrl: z.string().url().max(500),
  jiraEmail: z.string().email().max(255),
  jiraApiToken: z.string().min(1),
  tempoApiToken: z.string().optional(),
  fieldMapping: fieldMappingSchema,
});

const testSchema = z.object({
  jiraUrl: z.string().url(),
  jiraEmail: z.string().email(),
  jiraApiToken: z.string().min(1),
});

/**
 * GET /api/jira-connections
 * Liste toutes les connexions JIRA disponibles (avec le nombre de clients liés).
 * Admin uniquement.
 */
router.get('/', requireAuth, adminOnly, async (req, res, next) => {
  try {
    const connections = await prisma.jiraConnection.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { clients: true } } },
    });
    res.json(connections);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/jira-connections/test
 * Teste des credentials JIRA sans les sauvegarder.
 * Admin uniquement.
 */
router.post('/test', requireAuth, adminOnly, async (req, res, next) => {
  try {
    const body = testSchema.parse(req.body);
    const jiraClient = new JiraClient(body.jiraUrl, body.jiraEmail, body.jiraApiToken);
    const result = await jiraClient.testConnection();
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/jira-connections
 * Crée une nouvelle connexion JIRA.
 * Admin uniquement.
 */
router.post('/', requireAuth, adminOnly, async (req, res, next) => {
  try {
    const body = connectionSchema.parse(req.body);

    const connection = await prisma.jiraConnection.create({
      data: {
        name: body.name,
        jiraUrl: body.jiraUrl,
        jiraEmail: body.jiraEmail,
        jiraApiToken: body.jiraApiToken,
        tempoApiToken: body.tempoApiToken ?? null,
        fieldMapping: body.fieldMapping ?? null,
      },
    });

    // Sync custom fields in background so they're available for field mapping
    const jiraClient = new JiraClient(body.jiraUrl, body.jiraEmail, body.jiraApiToken);
    syncCustomFields(jiraClient, connection.id).catch((err) => {
      logger.warn('syncCustomFields after create failed', { connectionId: connection.id, error: String(err) });
    });

    res.status(201).json(connection);
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/jira-connections/:id
 * Met à jour une connexion JIRA existante.
 * Admin uniquement.
 */
const updateSchema = connectionSchema.extend({ jiraApiToken: z.string().optional() });

router.patch('/:id', requireAuth, adminOnly, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const body = updateSchema.parse(req.body);

    const data: Record<string, unknown> = {
      name: body.name,
      jiraUrl: body.jiraUrl,
      jiraEmail: body.jiraEmail,
      tempoApiToken: body.tempoApiToken ?? null,
      fieldMapping: body.fieldMapping ?? undefined,
    };
    // Ne mettre à jour le token que s'il est fourni
    if (body.jiraApiToken) data.jiraApiToken = body.jiraApiToken;

    const connection = await prisma.jiraConnection.update({ where: { id }, data });

    res.json(connection);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/jira-connections/:id/issue-types
 * Retourne la liste des types d'issues disponibles sur l'instance JIRA.
 * Admin uniquement.
 */
router.get('/:id/issue-types', requireAuth, adminOnly, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const conn = await prisma.jiraConnection.findUniqueOrThrow({ where: { id } });
    const jiraClient = new JiraClient(conn.jiraUrl, conn.jiraEmail, conn.jiraApiToken);

    const issueTypes = await jiraClient.get<Array<{ name?: string }>>('/issuetype');
    const names = Array.from(
      new Set(
        (issueTypes ?? [])
          .map((t) => t.name?.trim())
          .filter((name): name is string => !!name),
      ),
    ).sort((a, b) => a.localeCompare(b));

    res.json(names);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/jira-connections/:id/test
 * Teste une connexion JIRA existante.
 * Admin uniquement.
 */
router.get('/:id/test', requireAuth, adminOnly, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const conn = await prisma.jiraConnection.findUniqueOrThrow({ where: { id } });
    const jiraClient = new JiraClient(conn.jiraUrl, conn.jiraEmail, conn.jiraApiToken);
    const result = await jiraClient.testConnection();
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/jira-connections/:id/fields
 * Liste les custom fields JIRA stockés pour cette connexion.
 * Admin uniquement.
 */
router.get('/:id/fields', requireAuth, adminOnly, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const fields = await prisma.jiraCustomField.findMany({
      where: { jiraConnectionId: id, isActive: true },
      orderBy: { name: 'asc' },
      select: { jiraFieldId: true, name: true, fieldType: true, schemaType: true },
    });
    res.json(fields.map((f) => ({ id: f.jiraFieldId, name: f.name, fieldType: f.fieldType, schemaType: f.schemaType })));
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/jira-connections/:id/sync-fields
 * Force la synchronisation des custom fields depuis JIRA.
 * Admin uniquement.
 */
router.post('/:id/sync-fields', requireAuth, adminOnly, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const conn = await prisma.jiraConnection.findUniqueOrThrow({ where: { id } });
    const jiraClient = new JiraClient(conn.jiraUrl, conn.jiraEmail, conn.jiraApiToken);
    const result = await syncCustomFields(jiraClient, id);
    res.json({ ok: true, ...result });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/jira-connections/:id
 * Supprime une connexion JIRA si aucun client ne l'utilise.
 * Admin uniquement.
 */
router.delete('/:id', requireAuth, adminOnly, async (req, res, next) => {
  try {
    const id = Number(req.params.id);

    const clientCount = await prisma.client.count({ where: { jiraConnectionId: id } });
    if (clientCount > 0) {
      throw new AppError(
        409,
        `Cette connexion est utilisée par ${clientCount} client(s). Réassignez-les avant de la supprimer.`,
        'CONNECTION_IN_USE',
      );
    }

    await prisma.jiraConnection.delete({ where: { id } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
