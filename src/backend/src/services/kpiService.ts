import { prisma } from '@/db/prisma';
import { generatePeriods } from '@/utils/periods';
import { AppError } from '@/api/middleware/errorHandler';

interface AuthUser {
  id: number;
  email: string;
  roles: string[];
}

/**
 * Vérifie que le collaborateur a accès au client demandé.
 * Admin et DM ont accès à tous les clients.
 */
async function assertClientAccess(clientId: number, user: AuthUser): Promise<void> {
  if (user.roles.includes('ADMIN') || user.roles.includes('DM')) return;

  const access = await prisma.collaboratorScope.findFirst({
    where: { collaboratorId: user.id, scopeType: 'CLIENT', scopeId: clientId },
  });

  if (!access) {
    throw new AppError(403, 'Access denied to this client', 'FORBIDDEN');
  }
}

/**
 * Retourne les résultats KPI d'un client pour une période donnée.
 */
export async function getDashboardKpis(
  clientId: number,
  period: string, // YYYY-MM
  periodType: string,
  user: AuthUser,
) {
  await assertClientAccess(clientId, user);

  const [year, month] = period.split('-').map(Number);
  const periodStart = new Date(year, month - 1, 1);
  const periodEnd = new Date(year, month, 0, 23, 59, 59);

  const userProfile = user.roles[0]; // Le profil est dans roles[0]

  const results = await prisma.kpiResult.findMany({
    where: {
      kpiClientConfig: { clientId, isActive: true },
      collaboratorId: null, // Résultats globaux uniquement (pas par collaborateur)
      periodStart: { gte: periodStart },
      periodEnd: { lte: periodEnd },
      periodType: periodType as 'MONTHLY' | 'QUARTERLY' | 'YEARLY',
      isObsolete: false,
    },
    include: {
      kpiClientConfig: {
        include: {
          kpiDefinition: {
            select: {
              id: true,
              name: true,
              unit: true,
              description: true,
              targetProfiles: { include: { profile: { select: { code: true } } } },
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
    orderBy: { kpiClientConfig: { kpiDefinition: { name: 'asc' } } },
  });

  // Filtrer par profil : admin voit tout, sinon filtrer par profil cible
  const isAdmin = userProfile === 'ADMIN';
  const filtered = isAdmin ? results : results.filter((r) => {
    const targets = r.kpiClientConfig.kpiDefinition.targetProfiles;
    if (!targets || targets.length === 0) return true;
    return targets.some((tp) => tp.profile.code === userProfile);
  });

  return filtered.map((r) => ({
    kpiId: r.kpiClientConfig.kpiDefinition.id,
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
    period,
    computedAt: r.computedAt,
    formulaVersion: r.formulaVersion,
  }));
}

/**
 * Retourne l'évolution d'un KPI sur N périodes (pour les sparklines et graphiques).
 */
export async function getKpiEvolution(
  clientId: number,
  kpiClientConfigId: number,
  periodsCount: number,
  user: AuthUser,
) {
  await assertClientAccess(clientId, user);

  const periods = generatePeriods('MONTHLY', new Date(), periodsCount);

  const results = await prisma.kpiResult.findMany({
    where: {
      kpiClientConfigId,
      periodType: 'MONTHLY',
      isObsolete: false,
      periodStart: { gte: periods[0].start },
    },
    orderBy: { periodStart: 'asc' },
  });

  // Aligner sur les périodes générées (remplir les trous avec null)
  return periods.map((p) => {
    const result = results.find(
      (r) => r.periodStart.toISOString().slice(0, 7) === p.label,
    );
    return {
      period: p.label,
      value: result?.value !== undefined && result.value !== null ? Number(result.value) : null,
      ticketCount: result?.ticketCount ?? null,
    };
  });
}

/**
 * Vue cross-client : retourne les résultats d'un KPI pour tous les clients accessibles.
 * Réservé aux rôles Admin et DM (vérifié au niveau route via adminOrDm middleware).
 */
export async function getCrossClientKpis(
  kpiDefinitionId: number,
  periodsCount: number,
  _user: AuthUser,
) {
  const periods = generatePeriods('MONTHLY', new Date(), periodsCount);

  const configs = await prisma.kpiClientConfig.findMany({
    where: { kpiDefinitionId, isActive: true },
    include: {
      client: { select: { id: true, name: true, status: true } },
    },
  });

  const activeConfigs = configs.filter((c) => c.client.status !== 'ARCHIVED');

  const data = await Promise.all(
    activeConfigs.map(async (config) => {
      const results = await prisma.kpiResult.findMany({
        where: {
          kpiClientConfigId: config.id,
          periodType: 'MONTHLY',
          isObsolete: false,
          periodStart: { gte: periods[0].start },
        },
        orderBy: { periodStart: 'asc' },
      });

      const series = periods.map((p) => {
        const result = results.find(
          (r) => r.periodStart.toISOString().slice(0, 7) === p.label,
        );
        return { period: p.label, value: result?.value !== undefined && result.value !== null ? Number(result.value) : null };
      });

      return {
        clientId: config.client.id,
        clientName: config.client.name,
        logoUrl: null,
        series,
      };
    }),
  );

  return { periods: periods.map((p) => p.label), clients: data };
}
