import { Router } from 'express';
import { requireAuth } from '@/auth/jwtMiddleware';
import { adminOnly, managerAndAbove } from '@/auth/rbacMiddleware';
import { Prisma } from '@prisma/client';
import { prisma } from '@/db/prisma';
import { AppError } from '../middleware/errorHandler';
import { z } from 'zod';
import { METRICS_CATALOG } from '@/engine/formula/metricsCatalog';
import { validateFormula } from '@/engine/formula/validator';
import { FormulaAstCalculator } from '@/engine/formula/FormulaAstCalculator';
import { SqlCalculator } from '@/engine/calculators/sql/SqlCalculator';
import type { FormulaAst } from '@/engine/formula/types';
import type { AuthenticatedRequest } from '@/auth/jwtMiddleware';
import { createJobLog, completeJobLog } from '@/services/jobLogger';
import { getAppSetting } from '@/services/appSettings';

const router = Router();

/**
 * GET /api/kpi/definitions
 * Liste toutes les définitions KPI (catalogue).
 */
router.get('/definitions', requireAuth, async (_req, res, next) => {
  try {
    const definitions = await prisma.kpiDefinition.findMany({
      orderBy: { name: 'asc' },
      include: {
        targetProfiles: {
          include: { profile: { select: { id: true, code: true, label: true } } },
        },
      },
    });
    res.json(definitions);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/kpi/configs
 * Retourne les configs KPI d'un client.
 * Query: clientId
 */
router.get('/configs', requireAuth, managerAndAbove, async (req, res, next) => {
  try {
    const clientId = Number(req.query.clientId);
    if (!clientId) throw new AppError(400, 'clientId is required', 'MISSING_PARAMS');

    const configs = await prisma.kpiClientConfig.findMany({
      where: { clientId },
      include: {
        kpiDefinition: {
          include: {
            targetProfiles: {
              include: { profile: { select: { id: true, code: true, label: true } } },
            },
          },
        },
      },
      orderBy: { kpiDefinition: { name: 'asc' } },
    });
    res.json(configs);
  } catch (err) {
    next(err);
  }
});

const configOverrideSchema = z.object({
  configOverride: z.record(z.unknown()).optional(),
  formulaOverride: z.string().nullable().optional(),
  formulaAstOverride: z.record(z.unknown()).nullable().optional(),
  isActive: z.boolean().optional(),
  debugMode: z.boolean().optional(),
  debugCollaboratorId: z.number().int().positive().nullable().optional(),
  thresholdRedMin: z.number().nullable().optional(),
  thresholdRedMax: z.number().nullable().optional(),
  thresholdOrangeMin: z.number().nullable().optional(),
  thresholdOrangeMax: z.number().nullable().optional(),
  thresholdGreenMin: z.number().nullable().optional(),
  thresholdGreenMax: z.number().nullable().optional(),
});

/**
 * PATCH /api/kpi/configs/:id
 * Met à jour la config KPI d'un client (overrides, seuils, formule).
 * Admins et Managers uniquement.
 */
router.patch('/configs/:id', requireAuth, managerAndAbove, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const body = configOverrideSchema.parse(req.body);

    const updated = await prisma.kpiClientConfig.update({
      where: { id },
      data: {
        ...(body.configOverride !== undefined && { configOverride: body.configOverride as Prisma.InputJsonValue }),
        ...(body.formulaOverride !== undefined && { formulaOverride: body.formulaOverride }),
        ...(body.formulaAstOverride !== undefined && { formulaAstOverride: body.formulaAstOverride as Prisma.InputJsonValue }),
        ...(body.isActive !== undefined && { isActive: body.isActive }),
        ...(body.debugMode !== undefined && { debugMode: body.debugMode }),
        ...(body.debugCollaboratorId !== undefined && { debugCollaboratorId: body.debugCollaboratorId }),
        ...(body.thresholdRedMin !== undefined && { thresholdRedMin: body.thresholdRedMin }),
        ...(body.thresholdRedMax !== undefined && { thresholdRedMax: body.thresholdRedMax }),
        ...(body.thresholdOrangeMin !== undefined && { thresholdOrangeMin: body.thresholdOrangeMin }),
        ...(body.thresholdOrangeMax !== undefined && { thresholdOrangeMax: body.thresholdOrangeMax }),
        ...(body.thresholdGreenMin !== undefined && { thresholdGreenMin: body.thresholdGreenMin }),
        ...(body.thresholdGreenMax !== undefined && { thresholdGreenMax: body.thresholdGreenMax }),
        updatedAt: new Date(),
      },
      include: { kpiDefinition: true },
    });

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

const definitionSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  unit: z.string().max(50).optional(),
  formulaType: z.enum(['FORMULA_AST', 'SQL']),
  baseConfig: z.record(z.unknown()).default({}),
  formulaAst: z.record(z.unknown()).optional(),
  // Profils cibles (vide = tous)
  targetProfileIds: z.array(z.number().int().positive()).optional(),
  // Seuils par défaut
  defaultThresholdRedMin: z.number().nullable().optional(),
  defaultThresholdRedMax: z.number().nullable().optional(),
  defaultThresholdOrangeMin: z.number().nullable().optional(),
  defaultThresholdOrangeMax: z.number().nullable().optional(),
  defaultThresholdGreenMin: z.number().nullable().optional(),
  defaultThresholdGreenMax: z.number().nullable().optional(),
});

/**
 * POST /api/kpi/definitions
 * Crée une nouvelle définition KPI (catalogue global).
 */
router.post('/definitions', requireAuth, adminOnly, async (req, res, next) => {
  try {
    const body = definitionSchema.parse(req.body);
    // Valider l'AST si fourni
    if (body.formulaType === 'FORMULA_AST' && body.formulaAst) {
      const validation = validateFormula(body.formulaAst as unknown as FormulaAst);
      if (!validation.valid) {
        throw new AppError(400, `Formule invalide: ${validation.errors.join(', ')}`, 'INVALID_FORMULA');
      }
    }

    const def = await prisma.kpiDefinition.create({
      data: {
        name: body.name,
        description: body.description ?? null,
        unit: body.unit ?? null,
        formulaType: body.formulaType,
        baseConfig: body.baseConfig as Prisma.InputJsonValue,
        formulaAst: (body.formulaAst ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        defaultThresholdRedMin: body.defaultThresholdRedMin ?? null,
        defaultThresholdRedMax: body.defaultThresholdRedMax ?? null,
        defaultThresholdOrangeMin: body.defaultThresholdOrangeMin ?? null,
        defaultThresholdOrangeMax: body.defaultThresholdOrangeMax ?? null,
        defaultThresholdGreenMin: body.defaultThresholdGreenMin ?? null,
        defaultThresholdGreenMax: body.defaultThresholdGreenMax ?? null,
        isSystem: false,
        ...(body.targetProfileIds && body.targetProfileIds.length > 0 && {
          targetProfiles: {
            create: body.targetProfileIds.map((profileId) => ({ profileId })),
          },
        }),
      },
      include: {
        targetProfiles: {
          include: { profile: { select: { id: true, code: true, label: true } } },
        },
      },
    });
    res.status(201).json(def);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/kpi/definitions/:id/duplicate
 * Duplique une définition KPI existante.
 * Admin uniquement.
 */
router.post('/definitions/:id/duplicate', requireAuth, adminOnly, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const original = await prisma.kpiDefinition.findUniqueOrThrow({
      where: { id },
      include: {
        targetProfiles: true,
      },
    });

    const copy = await prisma.kpiDefinition.create({
      data: {
        name: `Copie de ${original.name}`,
        description: original.description,
        unit: original.unit,
        formulaType: original.formulaType,
        baseConfig: (original.baseConfig ?? {}) as Prisma.InputJsonValue,
        configSchema: (original.configSchema ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        formulaAst: (original.formulaAst ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        defaultThresholdRedMin: original.defaultThresholdRedMin,
        defaultThresholdRedMax: original.defaultThresholdRedMax,
        defaultThresholdOrangeMin: original.defaultThresholdOrangeMin,
        defaultThresholdOrangeMax: original.defaultThresholdOrangeMax,
        defaultThresholdGreenMin: original.defaultThresholdGreenMin,
        defaultThresholdGreenMax: original.defaultThresholdGreenMax,
        isSystem: false,
        ...(original.targetProfiles.length > 0 && {
          targetProfiles: {
            create: original.targetProfiles.map((tp) => ({ profileId: tp.profileId })),
          },
        }),
      },
      include: {
        targetProfiles: {
          include: { profile: { select: { id: true, code: true, label: true } } },
        },
      },
    });

    res.status(201).json(copy);
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/kpi/definitions/:id
 * Met à jour une définition KPI du catalogue.
 * Admin uniquement.
 */
router.patch('/definitions/:id', requireAuth, adminOnly, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const body = definitionSchema.partial().parse(req.body);

    // Handle N:N targetProfiles replacement
    if (body.targetProfileIds !== undefined) {
      await prisma.kpiDefinitionProfile.deleteMany({ where: { kpiDefinitionId: id } });
      if (body.targetProfileIds.length > 0) {
        await prisma.kpiDefinitionProfile.createMany({
          data: body.targetProfileIds.map((profileId) => ({ kpiDefinitionId: id, profileId })),
        });
      }
    }

    const def = await prisma.kpiDefinition.update({
      where: { id },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.description !== undefined && { description: body.description ?? null }),
        ...(body.unit !== undefined && { unit: body.unit ?? null }),
        ...(body.formulaType !== undefined && { formulaType: body.formulaType }),
        ...(body.baseConfig !== undefined && { baseConfig: body.baseConfig as Prisma.InputJsonValue }),
        ...(body.formulaAst !== undefined && { formulaAst: (body.formulaAst ?? Prisma.JsonNull) as Prisma.InputJsonValue }),
        ...(body.defaultThresholdRedMin !== undefined && { defaultThresholdRedMin: body.defaultThresholdRedMin }),
        ...(body.defaultThresholdRedMax !== undefined && { defaultThresholdRedMax: body.defaultThresholdRedMax }),
        ...(body.defaultThresholdOrangeMin !== undefined && { defaultThresholdOrangeMin: body.defaultThresholdOrangeMin }),
        ...(body.defaultThresholdOrangeMax !== undefined && { defaultThresholdOrangeMax: body.defaultThresholdOrangeMax }),
        ...(body.defaultThresholdGreenMin !== undefined && { defaultThresholdGreenMin: body.defaultThresholdGreenMin }),
        ...(body.defaultThresholdGreenMax !== undefined && { defaultThresholdGreenMax: body.defaultThresholdGreenMax }),
      },
      include: {
        targetProfiles: {
          include: { profile: { select: { id: true, code: true, label: true } } },
        },
      },
    });
    res.json(def);
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/kpi/definitions/:id
 * Supprime une definition KPI et toutes ses assignations client.
 */
router.delete('/definitions/:id', requireAuth, adminOnly, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    // Supprimer les configs client + resultats associes
    const configs = await prisma.kpiClientConfig.findMany({ where: { kpiDefinitionId: id }, select: { id: true } });
    for (const c of configs) {
      await prisma.kpiResult.deleteMany({ where: { kpiClientConfigId: c.id } });
    }
    await prisma.kpiClientConfig.deleteMany({ where: { kpiDefinitionId: id } });
    await prisma.kpiDefinitionProfile.deleteMany({ where: { kpiDefinitionId: id } });
    await prisma.kpiDefinition.delete({ where: { id } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

const assignSchema = z.object({
  clientId: z.number().int().positive(),
  kpiDefinitionId: z.number().int().positive(),
});

/**
 * POST /api/kpi/configs
 * Assigne un KPI (définition) à un client.
 */
router.post('/configs', requireAuth, adminOnly, async (req, res, next) => {
  try {
    const body = assignSchema.parse(req.body);

    // Charger la définition pour copier les seuils par défaut
    const def = await prisma.kpiDefinition.findUnique({ where: { id: body.kpiDefinitionId } });
    if (!def) throw new AppError(404, 'KPI definition not found', 'NOT_FOUND');

    const config = await prisma.kpiClientConfig.create({
      data: {
        clientId: body.clientId,
        kpiDefinitionId: body.kpiDefinitionId,
        isActive: true,
        formulaVersion: '1.0',
        // Copie des seuils par défaut depuis la définition
        thresholdRedMin: def.defaultThresholdRedMin,
        thresholdRedMax: def.defaultThresholdRedMax,
        thresholdOrangeMin: def.defaultThresholdOrangeMin,
        thresholdOrangeMax: def.defaultThresholdOrangeMax,
        thresholdGreenMin: def.defaultThresholdGreenMin,
        thresholdGreenMax: def.defaultThresholdGreenMax,
      },
      include: { kpiDefinition: true },
    });
    res.status(201).json(config);
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/kpi/configs/:id
 * Supprime l'assignation d'un KPI à un client (+ ses résultats associés).
 */
router.delete('/configs/:id', requireAuth, adminOnly, async (req, res, next) => {
  try {
    const id = Number(req.params.id);

    const config = await prisma.kpiClientConfig.findUnique({ where: { id } });
    if (!config) throw new AppError(404, 'Config not found', 'NOT_FOUND');

    // Supprimer les résultats KPI associés
    await prisma.kpiResult.deleteMany({ where: { kpiClientConfigId: id } });

    // Supprimer la config
    await prisma.kpiClientConfig.delete({ where: { id } });

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/kpi/results
 * Récupère les résultats KPI pour un client et une période.
 * Query: clientId, periodStart, periodEnd
 */
router.get('/results', requireAuth, async (req, res, next) => {
  try {
    const clientId = Number(req.query.clientId);
    const periodStart = req.query.periodStart ? new Date(String(req.query.periodStart)) : null;
    const periodEnd = req.query.periodEnd ? new Date(String(req.query.periodEnd)) : null;

    if (!clientId) throw new AppError(400, 'clientId is required', 'MISSING_PARAMS');

    const results = await prisma.kpiResult.findMany({
      where: {
        kpiClientConfig: { clientId },
        isObsolete: false,
        ...(periodStart && periodEnd
          ? { periodStart: { gte: periodStart }, periodEnd: { lte: periodEnd } }
          : {}),
      },
      include: { kpiClientConfig: { include: { kpiDefinition: true } } },
      orderBy: [{ periodStart: 'desc' }, { kpiClientConfig: { kpiDefinition: { name: 'asc' } } }],
    });

    res.json(results);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/kpi/recalculate
 * Force un recalcul KPI.
 * Body: { clientId?: number, period?: "YYYY-MM", allClients?: boolean }
 * - clientId seul → recalcule toutes les périodes pour ce client
 * - clientId + period → recalcule un mois précis pour ce client
 * - allClients: true → recalcule tous les clients actifs (+ period optionnel)
 */
router.post('/recalculate', requireAuth, adminOnly, async (req, res, next) => {
  try {
    const { clientId, period, allClients } = req.body as { clientId?: number; period?: string; allClients?: boolean };

    const { runKpiCalculationForClient } = await import('@/engine');

    if (allClients) {
      const jobLogId = await createJobLog({ jobType: 'KPI_CALC', triggeredBy: 'MANUAL' });
      const clients = await prisma.client.findMany({ where: { status: 'ACTIVE' }, select: { id: true, name: true } });

      // Return immediately — run calculation in background
      res.status(202).json({ ok: true, jobLogId, message: 'KPI recalculation started for all clients' });

      setImmediate(async () => {
        let errorCount = 0;
        let successCount = 0;
        const allDetails: Array<{ client: string; details: unknown[] }> = [];
        for (const c of clients) {
          try {
            const { details } = await runKpiCalculationForClient(c.id, period);
            successCount++;
            allDetails.push({ client: c.name, details });
          } catch (err) {
            errorCount++;
            allDetails.push({ client: c.name, details: [{ status: 'error', reason: err instanceof Error ? err.message : String(err) }] });
          }
        }
        await completeJobLog(jobLogId, {
          status: errorCount > 0 && successCount === 0 ? 'FAILED' : 'COMPLETED',
          itemsProcessed: successCount,
          errorCount,
          errorMessage: errorCount > 0 ? `${errorCount} client(s) failed` : undefined,
          metadata: { clients: allDetails },
        });
      });
      return;
    }

    if (!clientId) throw new AppError(400, 'clientId or allClients is required', 'MISSING_PARAMS');

    const jobLogId = await createJobLog({ jobType: 'KPI_CALC', clientId, triggeredBy: 'MANUAL' });

    // Return immediately — run calculation in background
    res.status(202).json({ ok: true, jobLogId, message: 'KPI recalculation started' });

    // Non-blocking calculation
    setImmediate(async () => {
      try {
        const { details } = await runKpiCalculationForClient(clientId, period);
        const okCount = details.filter((d) => d.status === 'ok').length;
        const skippedCount = details.filter((d) => d.status === 'skipped').length;
        const errorCount = details.filter((d) => d.status === 'error').length;
        await completeJobLog(jobLogId, {
          status: errorCount > 0 && okCount === 0 ? 'FAILED' : 'COMPLETED',
          itemsProcessed: okCount,
          errorCount,
          errorMessage: skippedCount > 0 || errorCount > 0
            ? details.filter((d) => d.status !== 'ok').map((d) => `${d.kpiName}: ${d.reason}`).join(' | ')
            : undefined,
          metadata: { details },
        });
      } catch (err) {
        await completeJobLog(jobLogId, { status: 'FAILED', errorMessage: err instanceof Error ? err.message : String(err) });
      }
    });
  } catch (err) {
    next(err);
  }
});

// ============================================================
/**
 * GET /api/kpi/source-issues
 * Retourne les issues ayant servi au calcul d'un KPI pour un collaborateur et une période.
 * Query: kpiClientConfigId, collaboratorId (optionnel), period (YYYY-MM)
 */
router.get('/source-issues', requireAuth, managerAndAbove, async (req: AuthenticatedRequest, res, next) => {
  try {
    const kpiClientConfigId = Number(req.query.kpiClientConfigId);
    const collaboratorId = req.query.collaboratorId ? Number(req.query.collaboratorId) : undefined;
    const period = String(req.query.period ?? '');

    if (!kpiClientConfigId || !period) {
      throw new AppError(400, 'kpiClientConfigId and period are required', 'MISSING_PARAMS');
    }

    // Charger la config KPI avec sa définition
    const config = await prisma.kpiClientConfig.findUnique({
      where: { id: kpiClientConfigId },
      include: { kpiDefinition: true },
    });
    if (!config) throw new AppError(404, 'KPI config not found', 'NOT_FOUND');

    // Vérifier que c'est une formule AST ou SQL
    const clientAstOverride = (config as unknown as { formulaAstOverride: unknown }).formulaAstOverride as FormulaAst | null;
    const formulaAst = clientAstOverride ?? (config.kpiDefinition.formulaAst as FormulaAst | null);
    const isSql = config.kpiDefinition.formulaType === 'SQL';

    if (!formulaAst && !isSql) {
      throw new AppError(400, 'Ce KPI n\'a ni formule AST ni requete SQL configuree', 'NO_FORMULA');
    }

    // Résoudre le contexte
    const [year, month] = period.split('-').map(Number);
    const periodStart = new Date(year, month - 1, 1);
    const periodEnd = new Date(year, month, 0, 23, 59, 59);

    const projects = await prisma.project.findMany({
      where: { clientId: config.clientId, status: 'ACTIVE' },
      select: { id: true },
    });

    // Résoudre les jiraAccountIds du collaborateur si spécifié
    let jiraAccountIds: string[] | undefined;
    if (collaboratorId) {
      const jiraUsers = await prisma.jiraUser.findMany({
        where: { collaboratorId },
        select: { jiraAccountId: true },
      });
      jiraAccountIds = jiraUsers.map((ju) => ju.jiraAccountId);
    }

    const context = {
      clientId: config.clientId,
      projectIds: projects.map((p) => p.id),
      periodStart,
      periodEnd,
      periodType: 'MONTHLY' as const,
      formulaVersion: config.formulaVersion,
      ...(jiraAccountIds ? { collaboratorId, jiraAccountIds } : {}),
    };

    let issues;
    if (isSql) {
      // KPI SQL : extraire les issues via SqlCalculator
      const sqlCalc = new SqlCalculator();
      const finalConfig = { ...(config.kpiDefinition.baseConfig as Record<string, unknown>), ...(config.configOverride as Record<string, unknown> ?? {}) };
      const sql = (finalConfig as { sql?: string }).sql ?? '';
      issues = await sqlCalc.getMatchingIssues(sql, context);
    } else {
      const calculator = new FormulaAstCalculator();
      issues = await calculator.getMatchingIssues(formulaAst!, context);
    }

    // Résoudre les display names
    const accountIds = [...new Set(issues.map((i) => i.assigneeJiraAccountId).filter(Boolean))] as string[];
    const jiraUserRows = accountIds.length > 0
      ? await prisma.jiraUser.findMany({
          where: { jiraAccountId: { in: accountIds } },
          select: { jiraAccountId: true, displayName: true, collaborator: { select: { firstName: true, lastName: true } } },
        })
      : [];
    const nameMap = new Map(jiraUserRows.map((ju) => [
      ju.jiraAccountId,
      ju.collaborator ? `${ju.collaborator.firstName} ${ju.collaborator.lastName}`.trim() : ju.displayName,
    ]));

    res.json(issues.map((i) => ({
      ...i,
      originalEstimateHours: i.originalEstimateHours !== null ? Number(i.originalEstimateHours) : null,
      rollupEstimateHours: i.rollupEstimateHours !== null ? Number(i.rollupEstimateHours) : null,
      rollupTimeSpentHours: i.rollupTimeSpentHours !== null ? Number(i.rollupTimeSpentHours) : null,
      rollupRemainingHours: i.rollupRemainingHours !== null ? Number(i.rollupRemainingHours) : null,
      assigneeDisplayName: i.assigneeJiraAccountId ? (nameMap.get(i.assigneeJiraAccountId) ?? i.assigneeJiraAccountId) : null,
    })));
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/kpi/issue-worklogs
 * Retourne les worklogs d'une issue + ses sous-tâches (rollup détaillé).
 * Query: issueId, period? (YYYY-MM)
 * Si period est fourni, retourne les worklogs de la période + totaux comparatifs.
 */
router.get('/issue-worklogs', requireAuth, managerAndAbove, async (req: AuthenticatedRequest, res, next) => {
  try {
    const issueId = Number(req.query.issueId);
    if (!issueId) throw new AppError(400, 'issueId is required', 'MISSING_PARAMS');

    const period = req.query.period ? String(req.query.period) : null;
    let periodStart: Date | null = null;
    let periodEnd: Date | null = null;
    if (period && /^\d{4}-\d{2}$/.test(period)) {
      const [y, m] = period.split('-').map(Number);
      periodStart = new Date(y, m - 1, 1);
      periodEnd = new Date(y, m, 0, 23, 59, 59);
    }

    const issue = await prisma.issue.findUnique({
      where: { id: issueId },
      select: { id: true, jiraKey: true, jiraId: true, clientId: true, timeSpentSeconds: true, rollupTimeSpentHours: true },
    });
    if (!issue) throw new AppError(404, 'Issue not found', 'NOT_FOUND');

    // Trouver les sous-tâches via parentJiraId
    const childIssues = await prisma.issue.findMany({
      where: { clientId: issue.clientId, parentJiraId: issue.jiraId },
      select: { id: true, jiraKey: true, summary: true },
    });

    const allIssueIds = [issue.id, ...childIssues.map((c) => c.id)];
    const childMap = new Map(childIssues.map((c) => [c.id, c]));

    // Charger TOUS les worklogs (pour les totaux)
    const allWorklogs = await prisma.worklog.findMany({
      where: { issueId: { in: allIssueIds } },
      select: {
        id: true,
        issueId: true,
        authorJiraAccountId: true,
        timeSpentSeconds: true,
        startedAt: true,
        source: true,
      },
      orderBy: { startedAt: 'desc' },
    });

    // Résoudre les noms
    const accountIds = [...new Set(allWorklogs.map((w) => w.authorJiraAccountId))];
    const jiraUsers = accountIds.length > 0
      ? await prisma.jiraUser.findMany({
          where: { jiraAccountId: { in: accountIds } },
          select: { jiraAccountId: true, displayName: true, collaborator: { select: { firstName: true, lastName: true } } },
        })
      : [];
    const nameMap = new Map(jiraUsers.map((ju) => [
      ju.jiraAccountId,
      ju.collaborator ? `${ju.collaborator.firstName} ${ju.collaborator.lastName}`.trim() : ju.displayName,
    ]));

    const mapWorklog = (w: typeof allWorklogs[0]) => {
      const child = childMap.get(w.issueId);
      return {
        id: w.id,
        issueKey: child ? child.jiraKey : issue.jiraKey,
        issueSummary: child ? child.summary : null,
        isSubtask: !!child,
        authorDisplayName: nameMap.get(w.authorJiraAccountId) ?? w.authorJiraAccountId,
        timeSpentSeconds: w.timeSpentSeconds,
        startedAt: w.startedAt,
        source: w.source,
      };
    };

    // Filtrer par période si demandé
    const periodWorklogs = periodStart && periodEnd
      ? allWorklogs.filter((w) => w.startedAt >= periodStart! && w.startedAt <= periodEnd!)
      : allWorklogs;

    const totalAllSeconds = allWorklogs.reduce((s, w) => s + w.timeSpentSeconds, 0);
    const totalPeriodSeconds = periodWorklogs.reduce((s, w) => s + w.timeSpentSeconds, 0);

    const outsideWorklogs = allWorklogs.filter((w) => !periodWorklogs.includes(w));

    res.json({
      worklogs: periodWorklogs.map(mapWorklog),
      outsideWorklogs: outsideWorklogs.map(mapWorklog),
      totals: {
        periodSeconds: totalPeriodSeconds,
        periodHours: Math.round(totalPeriodSeconds / 36) / 100,
        allTimeSeconds: totalAllSeconds,
        allTimeHours: Math.round(totalAllSeconds / 36) / 100,
        jiraRollupHours: issue.rollupTimeSpentHours !== null ? Number(issue.rollupTimeSpentHours) : null,
        jiraTimeSpentHours: issue.timeSpentSeconds !== null ? Math.round(issue.timeSpentSeconds / 36) / 100 : null,
        worklogCountPeriod: periodWorklogs.length,
        worklogCountAllTime: allWorklogs.length,
        childIssueCount: childIssues.length,
      },
    });
  } catch (err) {
    next(err);
  }
});

// Moteur de formules guidées
// ============================================================

/**
 * GET /api/kpi/metrics
 * Retourne le catalogue de métriques disponibles pour construire des formules.
 */
router.get('/metrics', requireAuth, async (_req, res) => {
  const hiddenRaw = await getAppSetting('kpi.metrics.hidden', '');
  const hiddenSet = new Set(
    hiddenRaw.split(',').map((s) => s.trim()).filter(Boolean),
  );
  res.json(
    METRICS_CATALOG
      .filter((m) => !hiddenSet.has(m.id))
      .map((m) => ({
        id: m.id,
        label: m.label,
        description: m.description,
        source: m.source,
        valueType: m.valueType,
      })),
  );
});

/**
 * GET /api/kpi/metrics/all
 * Retourne le catalogue complet (admin) avec le flag hidden pour gestion dans Maintenance.
 */
router.get('/metrics/all', requireAuth, adminOnly, async (_req, res) => {
  const hiddenRaw = await getAppSetting('kpi.metrics.hidden', '');
  const hiddenSet = new Set(
    hiddenRaw.split(',').map((s) => s.trim()).filter(Boolean),
  );
  res.json(
    METRICS_CATALOG.map((m) => ({
      id: m.id,
      label: m.label,
      description: m.description,
      source: m.source,
      valueType: m.valueType,
      hidden: hiddenSet.has(m.id),
    })),
  );
});

/**
 * POST /api/kpi/validate-formula
 * Valide une formule AST et retourne une description humaine.
 * Body: FormulaAst
 */
router.post('/validate-formula', requireAuth, managerAndAbove, (req, res) => {
  const ast = req.body as FormulaAst;
  const result = validateFormula(ast);
  res.json(result);
});

/**
 * POST /api/kpi/test-formula
 * Exécute une formule AST en dry-run sur les données d'un client/période.
 * Body: { formulaAst: FormulaAst, clientId: number, period: "YYYY-MM" }
 */
router.post('/test-formula', requireAuth, managerAndAbove, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { formulaAst, clientId, period } = req.body as {
      formulaAst: FormulaAst;
      clientId: number;
      period: string;
    };

    if (!formulaAst || !clientId || !period) {
      throw new AppError(400, 'formulaAst, clientId and period are required', 'MISSING_PARAMS');
    }

    // Validation
    const validation = validateFormula(formulaAst);
    if (!validation.valid) {
      return res.json({ valid: false, errors: validation.errors });
    }

    // Résoudre le contexte
    const [year, month] = period.split('-').map(Number);
    const periodStart = new Date(year, month - 1, 1);
    const periodEnd = new Date(year, month, 0, 23, 59, 59);

    const projects = await prisma.project.findMany({
      where: { clientId, status: 'ACTIVE' },
      select: { id: true },
    });

    const context = {
      clientId,
      projectIds: projects.map((p) => p.id),
      periodStart,
      periodEnd,
      periodType: 'MONTHLY' as const,
      formulaVersion: 'test',
    };

    // Exécuter en dry-run
    const calculator = new FormulaAstCalculator();
    const result = await calculator.dryRun(formulaAst, context);

    res.json({
      valid: true,
      description: validation.description,
      result: {
        value: result.value !== null ? Math.round(result.value * 10000) / 10000 : null,
        ticketCount: result.ticketCount,
        excludedTicketCount: result.excludedTicketCount,
        debug: result.debug,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// Debug traces
// ============================================================

/**
 * GET /api/kpi/debug-traces
 * Retourne les traces debug pour une config KPI.
 * Query: kpiClientConfigId (requis), period? (YYYY-MM), collaboratorId?
 */
router.get('/debug-traces', requireAuth, adminOnly, async (req, res, next) => {
  try {
    const kpiClientConfigId = Number(req.query.kpiClientConfigId);
    if (!kpiClientConfigId) throw new AppError(400, 'kpiClientConfigId is required', 'MISSING_PARAMS');

    const period = req.query.period ? String(req.query.period) : undefined;
    const collaboratorId = req.query.collaboratorId ? Number(req.query.collaboratorId) : undefined;

    const where: Record<string, unknown> = { kpiClientConfigId };

    if (period && /^\d{4}-\d{2}$/.test(period)) {
      const [y, m] = period.split('-').map(Number);
      where.periodStart = new Date(y, m - 1, 1);
    }
    if (collaboratorId !== undefined) {
      where.collaboratorId = collaboratorId || null;
    }

    const traces = await prisma.kpiDebugTrace.findMany({
      where,
      orderBy: { computedAt: 'desc' },
      take: 100,
    });

    // Résoudre les noms des collaborateurs
    const collabIds = [...new Set(traces.map((t) => t.collaboratorId).filter((id): id is number => id !== null))];
    const collabs = collabIds.length > 0
      ? await prisma.collaborator.findMany({
          where: { id: { in: collabIds } },
          select: { id: true, firstName: true, lastName: true },
        })
      : [];
    const collabMap = new Map(collabs.map((c) => [c.id, `${c.firstName} ${c.lastName}`]));

    res.json(traces.map((t) => ({
      ...t,
      result: t.result !== null ? Number(t.result) : null,
      collaboratorName: t.collaboratorId ? (collabMap.get(t.collaboratorId) ?? null) : null,
    })));
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/kpi/debug-traces
 * Purge les traces debug d'une config KPI.
 * Query: kpiClientConfigId (requis)
 */
router.delete('/debug-traces', requireAuth, adminOnly, async (req, res, next) => {
  try {
    const kpiClientConfigId = Number(req.query.kpiClientConfigId);
    if (!kpiClientConfigId) throw new AppError(400, 'kpiClientConfigId is required', 'MISSING_PARAMS');

    const { count } = await prisma.kpiDebugTrace.deleteMany({ where: { kpiClientConfigId } });
    res.json({ ok: true, deleted: count });
  } catch (err) {
    next(err);
  }
});

export default router;
