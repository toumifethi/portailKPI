import { kpiCalcQueue } from '@/queue';
import { KpiCalcJobPayload } from '@/types/domain';
import { resolveConfig } from './configResolver';
import { SqlCalculator } from './calculators/sql/SqlCalculator';
import { FormulaAstCalculator } from './formula/FormulaAstCalculator';
import type { FormulaAst } from './formula/types';
import { prisma } from '@/db/prisma';
import { logger } from '@/utils/logger';
import { generatePeriods } from '@/utils/periods';
import { QueryCollector } from './queryCapture';

const sqlCalculator = new SqlCalculator();
const formulaAstCalculator = new FormulaAstCalculator();

/**
 * Worker KPI Engine — consomme les jobs de calcul KPI depuis Bull.
 * Déclenché après chaque import réussi (cf. DA-002, DA-008).
 */
export function startKpiEngineWorker(concurrency = 2) {
  kpiCalcQueue.process(concurrency, async (job) => {
    const payload: KpiCalcJobPayload = job.data;
    logger.info('KPI calc started', { clientId: payload.clientId, importJobId: payload.importJobId });

    await runKpiCalculationForClient(payload.clientId);

    logger.info('KPI calc completed', { clientId: payload.clientId });
  });

  kpiCalcQueue.on('failed', (job, err) => {
    logger.error('KPI calc job failed', { jobId: job.id, error: err.message });
  });
}

export interface KpiCalcDetail {
  kpiName: string;
  status: 'ok' | 'skipped' | 'error';
  reason?: string;
  collaboratorsCount?: number;
  periodsCount?: number;
}

export async function runKpiCalculationForClient(clientId: number, targetPeriod?: string, kpiDefinitionId?: number): Promise<{ details: KpiCalcDetail[] }> {
  // Charger les KPI actifs pour ce client (filtre optionnel par kpiDefinitionId)
  const kpiConfigs = await prisma.kpiClientConfig.findMany({
    where: {
      clientId,
      isActive: true,
      ...(kpiDefinitionId ? { kpiDefinitionId } : {}),
    },
    include: {
      kpiDefinition: true,
      aiFieldRules: true,
    },
  });

  const projects = await prisma.project.findMany({
    where: { clientId, status: 'ACTIVE' },
    select: { id: true },
  });
  const projectIds = projects.map((p) => p.id);

  // Charger le returnLinkType depuis la connexion JIRA du client
  const clientRecord = await prisma.client.findUnique({
    where: { id: clientId },
    select: { jiraConnection: { select: { fieldMapping: true } } },
  });
  const fieldMapping = (clientRecord?.jiraConnection?.fieldMapping as Record<string, unknown>) ?? {};
  const returnLinkType = (fieldMapping.returnLinkType as string) ?? 'est un retour de';

  // Si une période cible est spécifiée (YYYY-MM), ne calculer que pour ce mois
  let periods: Array<{ start: Date; end: Date; label: string }>;
  if (targetPeriod && /^\d{4}-\d{2}$/.test(targetPeriod)) {
    const [y, m] = targetPeriod.split('-').map(Number);
    periods = [{
      start: new Date(y, m - 1, 1),
      end: new Date(y, m, 0, 23, 59, 59),
      label: targetPeriod,
    }];
  } else {
    periods = generatePeriods('MONTHLY', new Date());
  }

  const details: KpiCalcDetail[] = [];

  for (const kpiConfig of kpiConfigs) {
    const kpiName = kpiConfig.kpiDefinition.name ?? `KPI #${kpiConfig.kpiDefinitionId}`;
    const def = kpiConfig.kpiDefinition;
    const clientAstOverride = (kpiConfig as unknown as { formulaAstOverride: unknown }).formulaAstOverride;

    // Check if formula is defined
    const hasFormula = kpiConfig.formulaOverride
      || clientAstOverride
      || (def.formulaType === 'FORMULA_AST' && def.formulaAst)
      || def.formulaType === 'SQL';

    if (!hasFormula) {
      details.push({ kpiName, status: 'skipped', reason: 'Formule non définie' });
      logger.warn('KPI calc: skipped — no formula', { kpiClientConfigId: kpiConfig.id, kpiName });
      continue;
    }

    try {
      // Si debug actif, purger les anciennes traces avant le nouveau calcul
      const isDebug = (kpiConfig as unknown as { debugMode?: boolean }).debugMode === true;
      if (isDebug) {
        await prisma.kpiDebugTrace.deleteMany({ where: { kpiClientConfigId: kpiConfig.id } });
        logger.info('KPI debug: purged old traces', { kpiClientConfigId: kpiConfig.id });
      }

      // 1. Calcul GLOBAL (collaboratorId = null)
      for (const period of periods) {
        await calculateAndStoreKpi(kpiConfig, projectIds, clientId, period, null, null, returnLinkType);
      }

      // 2. Calcul PAR COLLABORATEUR
      const activeCollaborators = await getActiveCollaborators(clientId, periods);

      logger.info('KPI calc: per-collaborator batch', {
        kpiClientConfigId: kpiConfig.id,
        collaboratorsCount: activeCollaborators.length,
        periodsCount: periods.length,
      });

      for (const collab of activeCollaborators) {
        for (const period of periods) {
          await calculateAndStoreKpi(kpiConfig, projectIds, clientId, period, collab.collaboratorId, collab.jiraAccountIds, returnLinkType);
        }
      }

      details.push({ kpiName, status: 'ok', collaboratorsCount: activeCollaborators.length, periodsCount: periods.length });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      details.push({ kpiName, status: 'error', reason: errMsg });
      logger.error('KPI calculation failed for config', {
        kpiClientConfigId: kpiConfig.id,
        error: err,
      });
    }
  }

  return { details };
}

/**
 * Récupère les collaborateurs actifs sur les périodes données :
 * assignees sur issues résolues OU auteurs de worklogs.
 * Résout via jira_users pour grouper plusieurs jiraAccountIds par collaborateur.
 */
async function getActiveCollaborators(
  clientId: number,
  periods: Array<{ start: Date; end: Date }>,
): Promise<Array<{ collaboratorId: number; jiraAccountIds: string[] }>> {
  const earliestStart = periods.reduce((min, p) => (p.start < min ? p.start : min), periods[0].start);
  const latestEnd = periods.reduce((max, p) => (p.end > max ? p.end : max), periods[0].end);

  // Assignees des issues résolues
  const issueAssignees = await prisma.issue.findMany({
    where: {
      clientId,
      resolvedAt: { gte: earliestStart, lte: latestEnd },
      assigneeJiraAccountId: { not: null },
    },
    select: { assigneeJiraAccountId: true },
    distinct: ['assigneeJiraAccountId'],
  });

  // Auteurs de worklogs
  const worklogAuthors = await prisma.worklog.findMany({
    where: {
      startedAt: { gte: earliestStart, lte: latestEnd },
      issue: { clientId },
    },
    select: { authorJiraAccountId: true },
    distinct: ['authorJiraAccountId'],
  });

  const allAccountIds = new Set<string>();
  for (const i of issueAssignees) {
    if (i.assigneeJiraAccountId) allAccountIds.add(i.assigneeJiraAccountId);
  }
  for (const w of worklogAuthors) {
    allAccountIds.add(w.authorJiraAccountId);
  }

  if (allAccountIds.size === 0) return [];

  // Résoudre les collaboratorId depuis la table jira_users
  const jiraUsers = await prisma.jiraUser.findMany({
    where: {
      jiraAccountId: { in: [...allAccountIds] },
      collaboratorId: { not: null },
    },
    select: { jiraAccountId: true, collaboratorId: true },
  });

  // Grouper les jiraAccountIds par collaborateur
  const collabMap = new Map<number, string[]>();
  for (const ju of jiraUsers) {
    if (ju.collaboratorId === null) continue;
    const existing = collabMap.get(ju.collaboratorId);
    if (existing) {
      existing.push(ju.jiraAccountId);
    } else {
      collabMap.set(ju.collaboratorId, [ju.jiraAccountId]);
    }
  }

  return [...collabMap.entries()].map(([collaboratorId, jiraAccountIds]) => ({
    collaboratorId,
    jiraAccountIds,
  }));
}

type KpiConfigWithRelations = Awaited<ReturnType<typeof prisma.kpiClientConfig.findMany>>[0] & {
  kpiDefinition: { formulaType: string; baseConfig: unknown; formulaAst: unknown };
  aiFieldRules: Array<{ fieldValue: string | null; rule: string }>;
};

async function calculateAndStoreKpi(
  kpiConfig: KpiConfigWithRelations,
  projectIds: number[],
  clientId: number,
  period: { start: Date; end: Date },
  collaboratorId: number | null,
  jiraAccountIds: string[] | null,
  returnLinkType?: string,
): Promise<void> {
  const def = kpiConfig.kpiDefinition;
  const finalConfig = resolveConfig(
    def.baseConfig as Record<string, unknown>,
    kpiConfig.configOverride as Record<string, unknown>,
  );

  // Mode debug : injecter le collecteur uniquement pour le global et/ou le collaborateur ciblé
  const cfgDebug = kpiConfig as unknown as { debugMode?: boolean; debugCollaboratorId?: number | null };
  const isDebugActive = cfgDebug.debugMode === true;
  const debugTargetCollabId = cfgDebug.debugCollaboratorId ?? null;

  // Tracer si : debug ON ET (calcul global OU collaborateur ciblé)
  const shouldTrace = isDebugActive && (
    collaboratorId === null ||                        // toujours tracer le global
    debugTargetCollabId === null ||                    // null = global uniquement (pas de per-collab trace)
    collaboratorId === debugTargetCollabId             // collaborateur ciblé
  );
  // Exception : si debugCollaboratorId = null, on ne trace PAS les per-collab
  const debugMode = shouldTrace && (collaboratorId === null || debugTargetCollabId !== null);
  const collector = debugMode ? new QueryCollector() : undefined;

  const context = {
    clientId,
    projectIds,
    periodStart: period.start,
    periodEnd: period.end,
    periodType: 'MONTHLY' as const,
    formulaVersion: kpiConfig.formulaVersion,
    ...(collaboratorId !== null && jiraAccountIds !== null ? { collaboratorId, jiraAccountIds } : {}),
    ...(returnLinkType ? { returnLinkType } : {}),
    ...(debugMode ? { debugMode, _queryCollector: collector } : {}),
  };

  let result;
  let formulaDescription = '';

  // Priorité : formulaOverride SQL > formulaAstOverride client > formulaAst global
  const clientAstOverride = (kpiConfig as unknown as { formulaAstOverride: unknown }).formulaAstOverride;

  if (kpiConfig.formulaOverride) {
    result = await sqlCalculator.runOverride(kpiConfig.formulaOverride, context);
    formulaDescription = `SQL override: ${kpiConfig.formulaOverride.substring(0, 200)}`;
  } else if (clientAstOverride) {
    result = await formulaAstCalculator.calculate(clientAstOverride as FormulaAst, context);
    formulaDescription = buildFormulaDescription(clientAstOverride as FormulaAst);
  } else if (def.formulaType === 'FORMULA_AST' && def.formulaAst) {
    result = await formulaAstCalculator.calculate(def.formulaAst as FormulaAst, context);
    formulaDescription = buildFormulaDescription(def.formulaAst as FormulaAst);
  } else if (def.formulaType === 'SQL') {
    const sql = (finalConfig as { sql?: string }).sql
      ?? (def.baseConfig as { sql?: string }).sql
      ?? '';
    result = await sqlCalculator.calculate(sql, context);
    formulaDescription = `SQL: ${sql.substring(0, 200)}`;
  } else {
    return;
  }

  // Stocker la trace debug si le mode est actif
  if (debugMode && collector) {
    await storeDebugTrace(kpiConfig, period, collaboratorId, finalConfig, collector, formulaDescription, result);
  }

  // Upsert via findFirst (collaboratorId nullable → findUnique ne supporte pas null)
  const existing = await prisma.kpiResult.findFirst({
    where: {
      kpiClientConfigId: kpiConfig.id,
      collaboratorId: collaboratorId,
      periodType: 'MONTHLY',
      periodStart: period.start,
    },
  });

  if (existing) {
    await prisma.kpiResult.update({
      where: { id: existing.id },
      data: {
        value: result.value,
        ticketCount: result.ticketCount,
        excludedTicketCount: result.excludedTicketCount,
        formulaVersion: kpiConfig.formulaVersion,
        isObsolete: false,
        computedAt: new Date(),
      },
    });
  } else {
    await prisma.kpiResult.create({
      data: {
        kpiClientConfigId: kpiConfig.id,
        collaboratorId,
        projectId: projectIds[0] ?? null,
        periodType: 'MONTHLY',
        periodStart: period.start,
        periodEnd: period.end,
        value: result.value,
        ticketCount: result.ticketCount,
        excludedTicketCount: result.excludedTicketCount,
        formulaVersion: kpiConfig.formulaVersion,
        isObsolete: false,
      },
    });
  }
}

// ── Debug trace storage ──

async function storeDebugTrace(
  kpiConfig: KpiConfigWithRelations,
  period: { start: Date; end: Date },
  collaboratorId: number | null,
  resolvedConfig: Record<string, unknown>,
  collector: QueryCollector,
  formulaDescription: string,
  result: { value: number | null; ticketCount: number },
): Promise<void> {
  try {
    // Extraire les filtres appliques depuis l'AST
    const ast = (kpiConfig as unknown as { formulaAstOverride: FormulaAst | null }).formulaAstOverride
      ?? (kpiConfig.kpiDefinition.formulaAst as FormulaAst | null);
    const filtersApplied = ast?.filters ?? {};

    await prisma.kpiDebugTrace.create({
      data: {
        kpiClientConfigId: kpiConfig.id,
        periodStart: period.start,
        periodEnd: period.end,
        collaboratorId,
        resolvedConfig: resolvedConfig as object,
        filtersApplied: filtersApplied as object,
        metrics: collector.getTraces() as unknown as object,
        formulaSteps: formulaDescription,
        result: result.value,
        ticketCount: result.ticketCount,
      },
    });
  } catch (err) {
    logger.error('Failed to store debug trace', { kpiClientConfigId: kpiConfig.id, error: err });
  }
}

/**
 * Construit une description lisible de la formule AST.
 */
function buildFormulaDescription(ast: FormulaAst): string {
  return describeNode(ast.expression);
}

function describeNode(node: { type: string; id?: string; value?: number; name?: string; args?: unknown[] }): string {
  if (node.type === 'metric') return node.id ?? '?';
  if (node.type === 'constant') return String(node.value ?? 0);
  if (node.type === 'function') {
    const args = (node.args as Array<typeof node>) ?? [];
    const argStrs = args.map(describeNode);
    const name = node.name ?? '?';
    if (name === 'ratio') return `(${argStrs[0]} / ${argStrs[1]}) * 100`;
    if (name === 'divide') return `${argStrs[0]} / ${argStrs[1]}`;
    if (name === 'add') return `(${argStrs[0]} + ${argStrs[1]})`;
    if (name === 'subtract') return `(${argStrs[0]} - ${argStrs[1]})`;
    if (name === 'multiply') return `(${argStrs[0]} * ${argStrs[1]})`;
    return `${name}(${argStrs.join(', ')})`;
  }
  return '?';
}
