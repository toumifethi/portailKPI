import { Router } from 'express';
import { requireAuth } from '@/auth/jwtMiddleware';
import { adminOrDm } from '@/auth/rbacMiddleware';
import { getDashboardKpis, getKpiEvolution, getCrossClientKpis } from '@/services/kpiService';
import { prisma } from '@/db/prisma';
import { AppError } from '../middleware/errorHandler';
import type { AuthenticatedRequest } from '@/auth/jwtMiddleware';

const router = Router();

/**
 * GET /api/dashboard/kpis
 * Retourne les KPI d'un client pour une période donnée.
 * Query: clientId, period (YYYY-MM), periodType (MONTHLY|QUARTERLY|YEARLY)
 */
router.get('/kpis', requireAuth, async (req, res, next) => {
  try {
    const clientId = Number(req.query.clientId);
    const period = String(req.query.period ?? '');
    const periodType = (req.query.periodType as string) ?? 'MONTHLY';

    if (!clientId || !period) {
      throw new AppError(400, 'clientId and period are required', 'MISSING_PARAMS');
    }

    const data = await getDashboardKpis(clientId, period, periodType, req.user!);
    res.json(data);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/dashboard/evolution
 * Retourne l'évolution d'un KPI sur N périodes.
 * Query: clientId, kpiClientConfigId, periods (number)
 */
router.get('/evolution', requireAuth, async (req, res, next) => {
  try {
    const clientId = Number(req.query.clientId);
    const kpiClientConfigId = Number(req.query.kpiClientConfigId);
    const periods = Number(req.query.periods ?? 13);

    if (!clientId || !kpiClientConfigId) {
      throw new AppError(400, 'clientId and kpiClientConfigId are required', 'MISSING_PARAMS');
    }

    const data = await getKpiEvolution(clientId, kpiClientConfigId, periods, req.user!);
    res.json(data);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/dashboard/cross-client
 * Vue cross-client (Admin/DM uniquement).
 * Query: kpiDefinitionId, periods
 */
router.get('/cross-client', requireAuth, adminOrDm, async (req, res, next) => {
  try {
    const kpiDefinitionId = Number(req.query.kpiDefinitionId);
    const periods = Number(req.query.periods ?? 13);

    if (!kpiDefinitionId) {
      throw new AppError(400, 'kpiDefinitionId is required', 'MISSING_PARAMS');
    }

    const data = await getCrossClientKpis(kpiDefinitionId, periods, req.user!);
    res.json(data);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/dashboard/kpis-by-user
 * Retourne les KPI par collaborateur pour un client et une période.
 * Query: clientId, period (YYYY-MM)
 * Retourne un tableau de { userId, displayName, kpis: [{ kpiName, value, unit, ticketCount }] }
 */
router.get('/kpis-by-user', requireAuth, async (req, res, next) => {
  try {
    const clientId = Number(req.query.clientId);
    const period = String(req.query.period ?? '');

    if (!clientId || !period || !/^\d{4}-\d{2}$/.test(period)) {
      throw new AppError(400, 'clientId and period (YYYY-MM) are required', 'MISSING_PARAMS');
    }

    const [year, month] = period.split('-').map(Number);
    const periodStart = new Date(year, month - 1, 1);

    // Récupérer les résultats KPI par collaborateur pour ce mois
    const results = await prisma.kpiResult.findMany({
      where: {
        kpiClientConfig: { clientId, isActive: true },
        collaboratorId: { not: null },
        periodType: 'MONTHLY',
        periodStart,
        isObsolete: false,
      },
      include: {
        collaborator: { select: { id: true, firstName: true, lastName: true, status: true } },
        kpiClientConfig: {
          select: {
            thresholdRedMin: true,
            thresholdRedMax: true,
            thresholdOrangeMin: true,
            thresholdOrangeMax: true,
            thresholdGreenMin: true,
            thresholdGreenMax: true,
            kpiDefinition: {
              select: {
                name: true,
                unit: true,
                defaultThresholdRedMin: true,
                defaultThresholdRedMax: true,
                defaultThresholdOrangeMin: true,
                defaultThresholdOrangeMax: true,
                defaultThresholdGreenMin: true,
                defaultThresholdGreenMax: true,
              },
            },
          },
        },
      },
      orderBy: { computedAt: 'desc' },
    });

    // Grouper par collaboratorId
    const byCollab = new Map<number, {
      collaboratorId: number;
      displayName: string;
      status: string;
      kpis: Array<{
        kpiName: string;
        unit: string | null;
        value: number | null;
        ticketCount: number;
        excludedTicketCount: number;
        thresholdRedMin: number | null;
        thresholdRedMax: number | null;
        thresholdOrangeMin: number | null;
        thresholdOrangeMax: number | null;
        thresholdGreenMin: number | null;
        thresholdGreenMax: number | null;
      }>;
    }>();

    for (const r of results) {
      if (!r.collaborator) continue;
      const cid = r.collaborator.id;

      if (!byCollab.has(cid)) {
        byCollab.set(cid, {
          collaboratorId: cid,
          displayName: `${r.collaborator.firstName} ${r.collaborator.lastName}`.trim(),
          status: r.collaborator.status,
          kpis: [],
        });
      }

      byCollab.get(cid)!.kpis.push({
        kpiName: r.kpiClientConfig.kpiDefinition.name,
        unit: r.kpiClientConfig.kpiDefinition.unit,
        value: r.value !== null ? Number(r.value) : null,
        ticketCount: r.ticketCount,
        excludedTicketCount: r.excludedTicketCount,
        // Fallback: utiliser la valeur surcharge du client, sinon la valeur par defaut de la definition
        thresholdRedMin: r.kpiClientConfig.thresholdRedMin !== null
          ? Number(r.kpiClientConfig.thresholdRedMin)
          : r.kpiClientConfig.kpiDefinition.defaultThresholdRedMin !== null
            ? Number(r.kpiClientConfig.kpiDefinition.defaultThresholdRedMin)
            : null,
        thresholdRedMax: r.kpiClientConfig.thresholdRedMax !== null
          ? Number(r.kpiClientConfig.thresholdRedMax)
          : r.kpiClientConfig.kpiDefinition.defaultThresholdRedMax !== null
            ? Number(r.kpiClientConfig.kpiDefinition.defaultThresholdRedMax)
            : null,
        thresholdOrangeMin: r.kpiClientConfig.thresholdOrangeMin !== null
          ? Number(r.kpiClientConfig.thresholdOrangeMin)
          : r.kpiClientConfig.kpiDefinition.defaultThresholdOrangeMin !== null
            ? Number(r.kpiClientConfig.kpiDefinition.defaultThresholdOrangeMin)
            : null,
        thresholdOrangeMax: r.kpiClientConfig.thresholdOrangeMax !== null
          ? Number(r.kpiClientConfig.thresholdOrangeMax)
          : r.kpiClientConfig.kpiDefinition.defaultThresholdOrangeMax !== null
            ? Number(r.kpiClientConfig.kpiDefinition.defaultThresholdOrangeMax)
            : null,
        thresholdGreenMin: r.kpiClientConfig.thresholdGreenMin !== null
          ? Number(r.kpiClientConfig.thresholdGreenMin)
          : r.kpiClientConfig.kpiDefinition.defaultThresholdGreenMin !== null
            ? Number(r.kpiClientConfig.kpiDefinition.defaultThresholdGreenMin)
            : null,
        thresholdGreenMax: r.kpiClientConfig.thresholdGreenMax !== null
          ? Number(r.kpiClientConfig.thresholdGreenMax)
          : r.kpiClientConfig.kpiDefinition.defaultThresholdGreenMax !== null
            ? Number(r.kpiClientConfig.kpiDefinition.defaultThresholdGreenMax)
            : null,
      });
    }

    // Trier par nombre total de tickets décroissant
    const sorted = [...byCollab.values()].sort((a, b) => {
      const aTotal = a.kpis.reduce((s, k) => s + k.ticketCount, 0);
      const bTotal = b.kpis.reduce((s, k) => s + k.ticketCount, 0);
      return bTotal - aTotal;
    });

    res.json(sorted);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/dashboard/my-kpis
 * KPIs personnels du collaborateur connecte, pour tous ses clients.
 * Query: period (YYYY-MM)
 */
router.get('/my-kpis', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const period = String(req.query.period ?? '');
    if (!period) throw new AppError(400, 'period is required', 'MISSING_PARAMS');

    const collaboratorId = req.user!.id;
    const [year, month] = period.split('-').map(Number);
    const periodStart = new Date(year, month - 1, 1);

    const results = await prisma.kpiResult.findMany({
      where: {
        collaboratorId,
        periodType: 'MONTHLY',
        periodStart,
        isObsolete: false,
        kpiClientConfig: { isActive: true },
      },
      include: {
        kpiClientConfig: {
          select: {
            thresholdRedMin: true,
            thresholdRedMax: true,
            thresholdOrangeMin: true,
            thresholdOrangeMax: true,
            thresholdGreenMin: true,
            thresholdGreenMax: true,
            client: { select: { id: true, name: true } },
            kpiDefinition: {
              select: {
                id: true,
                name: true,
                unit: true,
                defaultThresholdRedMin: true,
                defaultThresholdRedMax: true,
                defaultThresholdOrangeMin: true,
                defaultThresholdOrangeMax: true,
                defaultThresholdGreenMin: true,
                defaultThresholdGreenMax: true,
              },
            },
          },
        },
      },
    });

    // Grouper par client
    const byClient = new Map<number, {
      clientId: number;
      clientName: string;
      kpis: Array<{
        kpiName: string;
        unit: string | null;
        value: number | null;
        ticketCount: number;
        thresholdRedMin: number | null;
        thresholdRedMax: number | null;
        thresholdOrangeMin: number | null;
        thresholdOrangeMax: number | null;
        thresholdGreenMin: number | null;
        thresholdGreenMax: number | null;
      }>;
    }>();

    for (const r of results) {
      const cid = r.kpiClientConfig.client.id;
      if (!byClient.has(cid)) {
        byClient.set(cid, {
          clientId: cid,
          clientName: r.kpiClientConfig.client.name,
          kpis: [],
        });
      }
      byClient.get(cid)!.kpis.push({
        kpiName: r.kpiClientConfig.kpiDefinition.name,
        unit: r.kpiClientConfig.kpiDefinition.unit,
        value: r.value !== null ? Number(r.value) : null,
        ticketCount: r.ticketCount,
        // Fallback: utiliser la valeur surcharge du client, sinon la valeur par defaut de la definition
        thresholdRedMin: r.kpiClientConfig.thresholdRedMin !== null
          ? Number(r.kpiClientConfig.thresholdRedMin)
          : r.kpiClientConfig.kpiDefinition.defaultThresholdRedMin !== null
            ? Number(r.kpiClientConfig.kpiDefinition.defaultThresholdRedMin)
            : null,
        thresholdRedMax: r.kpiClientConfig.thresholdRedMax !== null
          ? Number(r.kpiClientConfig.thresholdRedMax)
          : r.kpiClientConfig.kpiDefinition.defaultThresholdRedMax !== null
            ? Number(r.kpiClientConfig.kpiDefinition.defaultThresholdRedMax)
            : null,
        thresholdOrangeMin: r.kpiClientConfig.thresholdOrangeMin !== null
          ? Number(r.kpiClientConfig.thresholdOrangeMin)
          : r.kpiClientConfig.kpiDefinition.defaultThresholdOrangeMin !== null
            ? Number(r.kpiClientConfig.kpiDefinition.defaultThresholdOrangeMin)
            : null,
        thresholdOrangeMax: r.kpiClientConfig.thresholdOrangeMax !== null
          ? Number(r.kpiClientConfig.thresholdOrangeMax)
          : r.kpiClientConfig.kpiDefinition.defaultThresholdOrangeMax !== null
            ? Number(r.kpiClientConfig.kpiDefinition.defaultThresholdOrangeMax)
            : null,
        thresholdGreenMin: r.kpiClientConfig.thresholdGreenMin !== null
          ? Number(r.kpiClientConfig.thresholdGreenMin)
          : r.kpiClientConfig.kpiDefinition.defaultThresholdGreenMin !== null
            ? Number(r.kpiClientConfig.kpiDefinition.defaultThresholdGreenMin)
            : null,
        thresholdGreenMax: r.kpiClientConfig.thresholdGreenMax !== null
          ? Number(r.kpiClientConfig.thresholdGreenMax)
          : r.kpiClientConfig.kpiDefinition.defaultThresholdGreenMax !== null
            ? Number(r.kpiClientConfig.kpiDefinition.defaultThresholdGreenMax)
            : null,
      });
    }

    res.json([...byClient.values()]);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/dashboard/evolution-by-user
 * Evolution d'un KPI pour un collaborateur sur N periodes.
 * Query: collaboratorId, kpiClientConfigId, periods (default 6)
 */
router.get('/evolution-by-user', requireAuth, async (req, res, next) => {
  try {
    const collaboratorId = Number(req.query.collaboratorId);
    const kpiClientConfigId = Number(req.query.kpiClientConfigId);
    const periodsCount = Number(req.query.periods ?? 6);

    if (!collaboratorId || !kpiClientConfigId) {
      throw new AppError(400, 'collaboratorId and kpiClientConfigId required', 'MISSING_PARAMS');
    }

    const { generatePeriods } = await import('@/utils/periods');
    const periods = generatePeriods('MONTHLY', new Date(), periodsCount);

    const results = await prisma.kpiResult.findMany({
      where: {
        kpiClientConfigId,
        collaboratorId,
        periodType: 'MONTHLY',
        isObsolete: false,
        periodStart: { gte: periods[0].start },
      },
      orderBy: { periodStart: 'asc' },
    });

    res.json(periods.map((p) => {
      const r = results.find((r) => r.periodStart.toISOString().slice(0, 7) === p.label);
      return {
        period: p.label,
        value: r?.value !== undefined && r.value !== null ? Number(r.value) : null,
        ticketCount: r?.ticketCount ?? null,
      };
    }));
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/dashboard/team-heatmap
 * Matrice collaborateur x KPI pour un client et une periode.
 * Query: clientId, period (YYYY-MM)
 * Retourne: { kpiNames: string[], collaborators: [{ name, values: { [kpiName]: value } }] }
 */
router.get('/team-heatmap', requireAuth, async (req, res, next) => {
  try {
    const clientId = Number(req.query.clientId);
    const period = String(req.query.period ?? '');

    if (!clientId || !period) throw new AppError(400, 'clientId and period required', 'MISSING_PARAMS');

    const [year, month] = period.split('-').map(Number);
    const periodStart = new Date(year, month - 1, 1);

    const results = await prisma.kpiResult.findMany({
      where: {
        kpiClientConfig: { clientId, isActive: true },
        collaboratorId: { not: null },
        periodType: 'MONTHLY',
        periodStart,
        isObsolete: false,
      },
      include: {
        collaborator: { select: { id: true, firstName: true, lastName: true } },
        kpiClientConfig: {
          include: {
            kpiDefinition: { select: { name: true, unit: true } },
            // Include thresholds for RAG coloring
          },
        },
      },
    });

    // Collecter les noms de KPI
    const kpiNames = [...new Set(results.map((r) => r.kpiClientConfig.kpiDefinition.name))].sort();

    // Collecter les configs pour les seuils
    const kpiConfigs = new Map<string, { thresholdRedMin: number | null; thresholdRedMax: number | null; thresholdOrangeMin: number | null; thresholdOrangeMax: number | null; thresholdGreenMin: number | null; thresholdGreenMax: number | null; unit: string | null }>();
    for (const r of results) {
      const name = r.kpiClientConfig.kpiDefinition.name;
      if (!kpiConfigs.has(name)) {
        const c = r.kpiClientConfig;
        kpiConfigs.set(name, {
          thresholdRedMin: c.thresholdRedMin !== null ? Number(c.thresholdRedMin) : null,
          thresholdRedMax: c.thresholdRedMax !== null ? Number(c.thresholdRedMax) : null,
          thresholdOrangeMin: c.thresholdOrangeMin !== null ? Number(c.thresholdOrangeMin) : null,
          thresholdOrangeMax: c.thresholdOrangeMax !== null ? Number(c.thresholdOrangeMax) : null,
          thresholdGreenMin: c.thresholdGreenMin !== null ? Number(c.thresholdGreenMin) : null,
          thresholdGreenMax: c.thresholdGreenMax !== null ? Number(c.thresholdGreenMax) : null,
          unit: r.kpiClientConfig.kpiDefinition.unit,
        });
      }
    }

    // Grouper par collaborateur
    const byCollab = new Map<number, { id: number; name: string; values: Record<string, { value: number | null; ticketCount: number }> }>();
    for (const r of results) {
      if (!r.collaborator) continue;
      const cid = r.collaborator.id;
      if (!byCollab.has(cid)) {
        byCollab.set(cid, {
          id: cid,
          name: `${r.collaborator.firstName} ${r.collaborator.lastName}`.trim(),
          values: {},
        });
      }
      byCollab.get(cid)!.values[r.kpiClientConfig.kpiDefinition.name] = {
        value: r.value !== null ? Number(r.value) : null,
        ticketCount: r.ticketCount,
      };
    }

    res.json({
      kpiNames,
      kpiConfigs: Object.fromEntries(kpiConfigs),
      collaborators: [...byCollab.values()].sort((a, b) => a.name.localeCompare(b.name)),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/dashboard/team-heatmap-history
 * Heatmap collaborateur × mois sur N periodes.
 * Query: clientId, kpiClientConfigId, periods (default 6)
 */
router.get('/team-heatmap-history', requireAuth, async (req, res, next) => {
  try {
    const clientId = Number(req.query.clientId);
    const kpiClientConfigId = Number(req.query.kpiClientConfigId);
    const periodsCount = Number(req.query.periods ?? 6);

    if (!clientId || !kpiClientConfigId) throw new AppError(400, 'clientId and kpiClientConfigId required', 'MISSING_PARAMS');

    const { generatePeriods } = await import('@/utils/periods');
    const periods = generatePeriods('MONTHLY', new Date(), periodsCount);

    // Charger les seuils pour le RAG (avec fallback sur les seuils par defaut de la definition)
    const config = await prisma.kpiClientConfig.findUnique({
      where: { id: kpiClientConfigId },
      include: {
        kpiDefinition: {
          select: {
            name: true,
            unit: true,
            defaultThresholdRedMin: true,
            defaultThresholdRedMax: true,
            defaultThresholdOrangeMin: true,
            defaultThresholdOrangeMax: true,
            defaultThresholdGreenMin: true,
            defaultThresholdGreenMax: true,
          },
        },
      },
    });
    if (!config) throw new AppError(404, 'Config not found', 'NOT_FOUND');

    // Charger tous les résultats par collaborateur pour ces périodes
    const results = await prisma.kpiResult.findMany({
      where: {
        kpiClientConfigId,
        collaboratorId: { not: null },
        periodType: 'MONTHLY',
        isObsolete: false,
        periodStart: { gte: periods[0].start },
      },
      include: {
        collaborator: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    // Grouper par collaborateur
    const byCollab = new Map<number, {
      id: number;
      name: string;
      initials: string;
      values: Record<string, number | null>;
    }>();

    for (const r of results) {
      if (!r.collaborator) continue;
      const cid = r.collaborator.id;
      if (!byCollab.has(cid)) {
        const name = `${r.collaborator.firstName} ${r.collaborator.lastName}`.trim();
        byCollab.set(cid, {
          id: cid,
          name,
          initials: `${r.collaborator.firstName[0] ?? ''}${r.collaborator.lastName[0] ?? ''}`.toUpperCase(),
          values: {},
        });
      }
      const periodLabel = r.periodStart.toISOString().slice(0, 7);
      byCollab.get(cid)!.values[periodLabel] = r.value !== null ? Number(r.value) : null;
    }

    // Calculer la moyenne équipe par période
    const teamAvg: Record<string, number | null> = {};
    for (const p of periods) {
      const vals = [...byCollab.values()].map((c) => c.values[p.label]).filter((v): v is number => v !== null);
      teamAvg[p.label] = vals.length > 0 ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : null;
    }

    res.json({
      kpiName: config.kpiDefinition.name,
      unit: config.kpiDefinition.unit,
      thresholds: {
        thresholdRedMin: config.thresholdRedMin !== null
          ? Number(config.thresholdRedMin)
          : config.kpiDefinition.defaultThresholdRedMin !== null
            ? Number(config.kpiDefinition.defaultThresholdRedMin)
            : null,
        thresholdRedMax: config.thresholdRedMax !== null
          ? Number(config.thresholdRedMax)
          : config.kpiDefinition.defaultThresholdRedMax !== null
            ? Number(config.kpiDefinition.defaultThresholdRedMax)
            : null,
        thresholdOrangeMin: config.thresholdOrangeMin !== null
          ? Number(config.thresholdOrangeMin)
          : config.kpiDefinition.defaultThresholdOrangeMin !== null
            ? Number(config.kpiDefinition.defaultThresholdOrangeMin)
            : null,
        thresholdOrangeMax: config.thresholdOrangeMax !== null
          ? Number(config.thresholdOrangeMax)
          : config.kpiDefinition.defaultThresholdOrangeMax !== null
            ? Number(config.kpiDefinition.defaultThresholdOrangeMax)
            : null,
        thresholdGreenMin: config.thresholdGreenMin !== null
          ? Number(config.thresholdGreenMin)
          : config.kpiDefinition.defaultThresholdGreenMin !== null
            ? Number(config.kpiDefinition.defaultThresholdGreenMin)
            : null,
        thresholdGreenMax: config.thresholdGreenMax !== null
          ? Number(config.thresholdGreenMax)
          : config.kpiDefinition.defaultThresholdGreenMax !== null
            ? Number(config.kpiDefinition.defaultThresholdGreenMax)
            : null,
      },
      periods: periods.map((p) => p.label),
      collaborators: [...byCollab.values()].sort((a, b) => a.name.localeCompare(b.name)),
      teamAverage: teamAvg,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/dashboard/last-update
 * Retourne la date du dernier import reussi pour un client.
 * Query: clientId
 */
router.get('/last-update', requireAuth, async (req, res, next) => {
  try {
    const clientId = Number(req.query.clientId);
    if (!clientId) throw new AppError(400, 'clientId required', 'MISSING_PARAMS');

    const lastImport = await prisma.importJob.findFirst({
      where: { clientId, status: 'COMPLETED' },
      orderBy: { completedAt: 'desc' },
      select: { completedAt: true, issuesFetched: true, worklogsFetched: true },
    });

    res.json({
      lastUpdate: lastImport?.completedAt ?? null,
      issuesFetched: lastImport?.issuesFetched ?? 0,
      worklogsFetched: lastImport?.worklogsFetched ?? 0,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
