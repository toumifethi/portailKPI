import { prisma } from '@/db/prisma';
import { CalculationContext, KpiCalculationResult, EMPTY_RESULT } from '@/types/domain';
import { getMetric, MetricDefinition } from './metricsCatalog';
import type { FormulaAst, FormulaNode, FormulaFilters, FormulaEvalResult, CustomFieldFilter, ScopeRule } from './types';
import { logger } from '@/utils/logger';
import type { QueryCollector } from '../queryCapture';

/**
 * Évalue une formule AST en requêtes Prisma.
 *
 * Principe : chaque noeud MetricNode est résolu en une agrégation SQL
 * sur issues ou worklogs, avec les filtres de contexte (client, période, collaborateur).
 * Les noeuds FunctionNode combinent les résultats arithmétiquement.
 */
export class FormulaAstCalculator {
  async calculate(
    ast: FormulaAst,
    context: CalculationContext,
  ): Promise<KpiCalculationResult> {
    // Pré-charger le cache parentJiraIds si le scope le nécessite,
    // pour que la trace _scope_parent_ids apparaisse AVANT les métriques
    const scopeType = ast.filters.scopeRule?.type;
    if (scopeType === 'worklogs_in_period') {
      await this.getParentJiraIdsWithChildWorklogs(context);
    }

    const result = await this.evaluate(ast.expression, ast.filters, context);
    return {
      value: result.value !== null ? Math.round(result.value * 10000) / 10000 : null,
      ticketCount: result.ticketCount,
      excludedTicketCount: result.excludedTicketCount,
      excludedTicketDetails: [],
    };
  }

  /** Mode dry-run : évalue et retourne les métriques intermédiaires */
  /**
   * Retourne les issues qui matchent les filtres de l'AST (pour affichage détail).
   */
  async getMatchingIssues(
    ast: FormulaAst,
    context: CalculationContext,
  ): Promise<Array<{
    id: number;
    jiraKey: string;
    summary: string;
    issueType: string;
    status: string;
    assigneeJiraAccountId: string | null;
    originalEstimateHours: number | null;
    timeSpentSeconds: number | null;
    rollupEstimateHours: number | null;
    rollupTimeSpentHours: number | null;
    rollupRemainingHours: number | null;
  }>> {
    const where = await this.buildIssueWhere(ast.filters, context);
    const hasCustomFilters = ast.filters.customFieldFilters && ast.filters.customFieldFilters.length > 0;
    const hasLabels = ast.filters.labels && ast.filters.labels.length > 0;
    const hasComponents = ast.filters.components && ast.filters.components.length > 0;
    const needsMemoryFilter = hasCustomFilters || hasLabels || hasComponents;

    const rawIssues = await prisma.issue.findMany({
      where,
      select: {
        id: true,
        jiraKey: true,
        summary: true,
        issueType: true,
        status: true,
        assigneeJiraAccountId: true,
        originalEstimateHours: true,
        timeSpentSeconds: true,
        rollupEstimateHours: true,
        rollupTimeSpentHours: true,
        rollupRemainingHours: true,
        ...(needsMemoryFilter ? { customFields: true } : {}),
      },
      orderBy: { jiraKey: 'asc' },
      take: 500,
    });

    // Appliquer les filtres en mémoire (custom fields, labels, components)
    const issues = needsMemoryFilter
      ? rawIssues.filter((issue) => {
          const cf = (issue as Record<string, unknown>).customFields as Record<string, unknown> | null;
          if (hasCustomFilters && !this.matchCustomFilters(cf, ast.filters.customFieldFilters!, ast.filters.customFieldLogic ?? 'AND')) return false;
          if (hasLabels) {
            const issueLabels = (cf?.labels as string[]) ?? [];
            if (!ast.filters.labels!.some((l) => issueLabels.includes(l))) return false;
          }
          if (hasComponents) {
            const issueComponents = ((cf?.components as Array<{ name?: string }>) ?? []).map((c) => c.name ?? '');
            if (!ast.filters.components!.some((c) => issueComponents.includes(c))) return false;
          }
          return true;
        })
      : rawIssues;

    return issues.map((i) => ({
      ...i,
      originalEstimateHours: i.originalEstimateHours !== null ? Number(i.originalEstimateHours) : null,
      rollupEstimateHours: i.rollupEstimateHours !== null ? Number(i.rollupEstimateHours) : null,
      rollupTimeSpentHours: i.rollupTimeSpentHours !== null ? Number(i.rollupTimeSpentHours) : null,
    }));
  }

  /** Mode dry-run : évalue et retourne les métriques intermédiaires */
  async dryRun(
    ast: FormulaAst,
    context: CalculationContext,
  ): Promise<FormulaEvalResult> {
    const debug: Record<string, number | null> = {};
    const result = await this.evaluate(ast.expression, ast.filters, context, debug);
    return { ...result, debug };
  }

  private async evaluate(
    node: FormulaNode,
    filters: FormulaFilters,
    context: CalculationContext,
    debug?: Record<string, number | null>,
  ): Promise<FormulaEvalResult> {
    switch (node.type) {
      case 'constant':
        return { value: node.value, ticketCount: 0, excludedTicketCount: 0 };

      case 'metric':
        return this.resolveMetric(node.id, filters, context, debug);

      case 'function': {
        // Merge local filters (node-level) with global filters
        const mergedFilters = node.filters
          ? { ...filters, ...node.filters,
              // Merge arrays instead of replacing
              issueTypes: node.filters.issueTypes ?? filters.issueTypes,
              statuses: node.filters.statuses ?? filters.statuses,
            }
          : filters;
        return this.resolveFunction(node.name, node.args, mergedFilters, context, debug);
      }
    }
  }

  // ── Résolution d'une métrique ──

  private async resolveMetric(
    metricId: string,
    filters: FormulaFilters,
    context: CalculationContext,
    debug?: Record<string, number | null>,
  ): Promise<FormulaEvalResult> {
    const metric = getMetric(metricId);
    if (!metric) {
      return { value: null, ticketCount: 0, excludedTicketCount: 0 };
    }

    const collector = context._queryCollector as QueryCollector | undefined;
    if (collector) collector.startMetric(metricId);

    let result: FormulaEvalResult;

    if (metric.source === 'issues') {
      result = await this.resolveIssueMetric(metric, filters, context);
    } else {
      result = await this.resolveWorklogMetric(metric, filters, context);
    }

    if (collector) collector.endMetric(result.ticketCount, result.value);

    if (debug) {
      debug[metricId] = result.value;
    }

    return result;
  }

  private async resolveIssueMetric(
    metric: MetricDefinition,
    filters: FormulaFilters,
    context: CalculationContext,
  ): Promise<FormulaEvalResult> {
    const where = await this.buildIssueWhere(filters, context, metric.implicitFilter);
    const hasCustomFilters = filters.customFieldFilters && filters.customFieldFilters.length > 0;
    const hasLabels = filters.labels && filters.labels.length > 0;
    const hasComponents = filters.components && filters.components.length > 0;
    const needsCustomFields = hasCustomFilters || hasLabels || hasComponents;

    // Champs à récupérer
    const select: Record<string, boolean> = {
      originalEstimateHours: true,
    };
    if (metric.field) select[metric.field] = true;
    if (needsCustomFields) select.customFields = true;

    const qStart = Date.now();
    const rawIssues = await prisma.issue.findMany({ where, select });
    const qDuration = Date.now() - qStart;

    // Enregistrer la requete dans le collecteur debug
    const col = context._queryCollector as QueryCollector | undefined;
    if (col) col.addQuery('Issue', 'findMany', where as Record<string, unknown>, select, qDuration);

    // Filtrer en mémoire (champs custom, labels, components)
    const issues = needsCustomFields
      ? rawIssues.filter((issue) => {
          const cf = (issue as Record<string, unknown>).customFields as Record<string, unknown> | null;

          // Custom field filters
          if (hasCustomFilters && !this.matchCustomFilters(cf, filters.customFieldFilters!, filters.customFieldLogic ?? 'AND')) {
            return false;
          }

          // Labels filter : l'issue doit avoir au moins un des labels demandés
          if (hasLabels) {
            const issueLabels = (cf?.labels as string[]) ?? [];
            if (!filters.labels!.some((l) => issueLabels.includes(l))) return false;
          }

          // Components filter : l'issue doit avoir au moins un des composants demandés
          if (hasComponents) {
            const issueComponents = ((cf?.components as Array<{ name?: string }>) ?? []).map((c) => c.name ?? '');
            if (!filters.components!.some((c) => issueComponents.includes(c))) return false;
          }

          return true;
        })
      : rawIssues;

    // Comptage pur
    if (metric.field === null) {
      return { value: issues.length, ticketCount: issues.length, excludedTicketCount: rawIssues.length - issues.length };
    }

    // Agrégation de champ
    let sum = 0;
    let count = 0;

    for (const issue of issues) {
      const raw = (issue as Record<string, unknown>)[metric.field];
      let val = raw !== null && raw !== undefined ? Number(raw) : null;
      if (val === null || isNaN(val)) continue;

      if (metric.transform === 'secondsToHours') {
        val = val / 3600;
      }

      sum += val;
      count++;
    }

    return { value: count > 0 ? sum : null, ticketCount: count, excludedTicketCount: issues.length - count };
  }

  /**
   * Vérifie si les customFields d'une issue matchent les filtres custom.
   * Supporte la logique AND (tous les filtres doivent matcher) ou OR (au moins un).
   */
  private matchCustomFilters(
    customFields: Record<string, unknown> | null,
    cfFilters: CustomFieldFilter[],
    logic: 'AND' | 'OR',
  ): boolean {
    if (!cfFilters.length) return true;
    const cf = customFields ?? {};

    const results = cfFilters.map((filter) => {
      let rawValue = cf[filter.fieldId];
      // JIRA stocke les champs option comme { id, value } ou { id, name } — extraire la valeur
      if (rawValue && typeof rawValue === 'object' && !Array.isArray(rawValue)) {
        const obj = rawValue as Record<string, unknown>;
        rawValue = obj.value ?? obj.name ?? rawValue;
      }
      const strValue = rawValue != null ? String(rawValue) : null;

      switch (filter.operator) {
        case 'is_null':
          return rawValue == null || rawValue === '';
        case 'not_null':
          return rawValue != null && rawValue !== '';
        case 'equals':
          return strValue === String(filter.value);
        case 'not_equals':
          return strValue !== String(filter.value);
        case 'in': {
          const values = Array.isArray(filter.value) ? filter.value : [filter.value];
          return strValue !== null && values.includes(strValue);
        }
        case 'not_in': {
          const values = Array.isArray(filter.value) ? filter.value : [filter.value];
          return strValue === null || !values.includes(strValue);
        }
        case 'gte': {
          const numVal = rawValue != null ? Number(rawValue) : null;
          const threshold = Number(filter.value);
          return numVal !== null && !isNaN(numVal) && !isNaN(threshold) && numVal >= threshold;
        }
        case 'lte': {
          const numVal = rawValue != null ? Number(rawValue) : null;
          const threshold = Number(filter.value);
          return numVal !== null && !isNaN(numVal) && !isNaN(threshold) && numVal <= threshold;
        }
        case 'between': {
          // value doit être un tableau [min, max]
          const numVal = rawValue != null ? Number(rawValue) : null;
          const bounds = Array.isArray(filter.value) ? filter.value.map(Number) : [];
          if (numVal === null || isNaN(numVal) || bounds.length !== 2) return false;
          return numVal >= bounds[0] && numVal <= bounds[1];
        }
        default:
          return true;
      }
    });

    return logic === 'AND'
      ? results.every(Boolean)
      : results.some(Boolean);
  }

  private async resolveWorklogMetric(
    metric: MetricDefinition,
    filters: FormulaFilters,
    context: CalculationContext,
  ): Promise<FormulaEvalResult> {
    const where = this.buildWorklogWhere(context);

    // Filtre implicite par auteur (pour temps_logue_auteur)
    if (metric.implicitFilter?._filterByAuthor && context.jiraAccountIds) {
      where.authorJiraAccountId = { in: context.jiraAccountIds };
    }

    if (metric.field === null) {
      const qStart = Date.now();
      const count = await prisma.worklog.count({ where });
      const qDuration = Date.now() - qStart;
      const col = context._queryCollector as QueryCollector | undefined;
      if (col) col.addQuery('Worklog', 'count', where as Record<string, unknown>, null, qDuration);
      return { value: count, ticketCount: count, excludedTicketCount: 0 };
    }

    const wlSelect = { [metric.field]: true };
    const qStart2 = Date.now();
    const worklogs = await prisma.worklog.findMany({
      where,
      select: wlSelect,
    });
    const qDuration2 = Date.now() - qStart2;
    const col2 = context._queryCollector as QueryCollector | undefined;
    if (col2) col2.addQuery('Worklog', 'findMany', where as Record<string, unknown>, wlSelect as Record<string, boolean>, qDuration2);

    let sum = 0;
    for (const wl of worklogs) {
      const raw = (wl as Record<string, unknown>)[metric.field];
      let val = raw !== null ? Number(raw) : 0;
      if (metric.transform === 'secondsToHours') val = val / 3600;
      sum += val;
    }

    return { value: sum, ticketCount: worklogs.length, excludedTicketCount: 0 };
  }

  // ── Résolution d'une fonction ──

  private async resolveFunction(
    name: string,
    args: FormulaNode[],
    filters: FormulaFilters,
    context: CalculationContext,
    debug?: Record<string, number | null>,
  ): Promise<FormulaEvalResult> {
    // Fonctions unaires sur métrique
    if (['sum', 'count', 'min', 'max', 'avg'].includes(name)) {
      if (args.length !== 1) return { value: null, ticketCount: 0, excludedTicketCount: 0 };
      const arg = args[0];

      if (name === 'sum' || name === 'count') {
        // sum et count sont résolus directement par la métrique
        return this.evaluate(arg, filters, context, debug);
      }

      if (name === 'avg') {
        const result = await this.evaluate(arg, filters, context, debug);
        if (result.ticketCount === 0 || result.value === null) return { ...result, value: null };
        return { ...result, value: result.value / result.ticketCount };
      }

      // min/max : on doit faire un query spécifique — simplifié ici
      return this.evaluate(arg, filters, context, debug);
    }

    // Fonctions binaires arithmétiques
    if (['add', 'subtract', 'multiply', 'divide', 'ratio'].includes(name)) {
      if (args.length !== 2) return { value: null, ticketCount: 0, excludedTicketCount: 0 };

      // En mode debug, exécuter séquentiellement pour que le QueryCollector
      // capture correctement chaque métrique (pas de concurrence sur currentMetric)
      let leftResult, rightResult;
      if (context.debugMode) {
        leftResult = await this.evaluate(args[0], filters, context, debug);
        rightResult = await this.evaluate(args[1], filters, context, debug);
      } else {
        [leftResult, rightResult] = await Promise.all([
          this.evaluate(args[0], filters, context, debug),
          this.evaluate(args[1], filters, context, debug),
        ]);
      }

      const a = leftResult.value;
      const b = rightResult.value;
      const totalTickets = leftResult.ticketCount + rightResult.ticketCount;

      if (a === null || b === null) {
        return { value: null, ticketCount: totalTickets, excludedTicketCount: 0 };
      }

      let value: number | null = null;
      switch (name) {
        case 'add': value = a + b; break;
        case 'subtract': value = a - b; break;
        case 'multiply': value = a * b; break;
        case 'divide': value = b !== 0 ? a / b : null; break;
        case 'ratio': value = b !== 0 ? (a / b) * 100 : null; break;
      }

      return { value, ticketCount: Math.max(leftResult.ticketCount, rightResult.ticketCount), excludedTicketCount: 0 };
    }

    // round(value, decimals)
    if (name === 'round' && args.length === 2) {
      const valResult = await this.evaluate(args[0], filters, context, debug);
      const decResult = await this.evaluate(args[1], filters, context, debug);
      if (valResult.value === null) return valResult;
      const decimals = decResult.value ?? 2;
      const factor = Math.pow(10, decimals);
      return { ...valResult, value: Math.round(valResult.value * factor) / factor };
    }

    // if_gt(value, threshold, then, else)
    if (name === 'if_gt' && args.length === 4) {
      const valResult = await this.evaluate(args[0], filters, context, debug);
      const threshResult = await this.evaluate(args[1], filters, context, debug);
      if (valResult.value === null || threshResult.value === null) return valResult;
      const branch = valResult.value > threshResult.value ? args[2] : args[3];
      return this.evaluate(branch, filters, context, debug);
    }

    return { value: null, ticketCount: 0, excludedTicketCount: 0 };
  }

  // ── Builders de WHERE Prisma ──

  private async buildIssueWhere(
    filters: FormulaFilters,
    context: CalculationContext,
    implicitFilter?: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const where: Record<string, unknown> = {
      clientId: context.clientId,
      projectId: { in: context.projectIds },
    };

    // Scope rule (sélection des issues pour la période)
    const scopeRule = filters.scopeRule;
    if (scopeRule) {
      await this.applyScopeRule(where, scopeRule, context);
    } else if (filters.useResolvedAt) {
      // Rétrocompatibilité avec l'ancien champ
      where.resolvedAt = { gte: context.periodStart, lte: context.periodEnd };
    } else {
      where.jiraUpdatedAt = { gte: context.periodStart, lte: context.periodEnd };
    }

    // Filtres utilisateur
    if (filters.issueTypes && filters.issueTypes.length > 0) {
      where.issueType = { in: filters.issueTypes };
    }
    if (filters.statuses && filters.statuses.length > 0) {
      where.status = { in: filters.statuses };
    }
    // labels et components sont filtrés en mémoire dans resolveIssueMetric (via customFields JSON)
    if (filters.excludeJiraKeys && filters.excludeJiraKeys.length > 0) {
      where.jiraKey = { notIn: filters.excludeJiraKeys };
    }

    // Filtre collaborateur
    if (context.jiraAccountIds) {
      where.assigneeJiraAccountId = { in: context.jiraAccountIds };
    }

    // Filtres implicites de la métrique
    if (implicitFilter) {
      if (implicitFilter.issueType) {
        where.issueType = implicitFilter.issueType;
      }
      if (implicitFilter._noEstimate) {
        where.OR = [
          { originalEstimateHours: null },
          { originalEstimateHours: { equals: 0 } },
        ];
      }

      // Issue link filters for quality KPIs
      // Convention: the "return" issue is the SOURCE of the link (e.g. "Bug attaché" points from return → dev)
      if (implicitFilter._hasReturnLink) {
        const returnLinkType = context.returnLinkType ?? 'est un retour de';
        if (context.jiraAccountIds) {
          // Attribution au développeur du ticket INITIAL (via le lien)
          // Retour assigné au dev du ticket initial, OU fallback sur l'assignee du retour
          delete where.assigneeJiraAccountId;
          where.sourceLinks = {
            some: {
              linkType: { contains: returnLinkType },
              targetIssue: { assigneeJiraAccountId: { in: context.jiraAccountIds } },
            },
          };
          // Fallback: si pas de lien vers un ticket du collaborateur, inclure aussi
          // les retours directement assignés au collaborateur
          const existingOR = where.OR as unknown[] | undefined;
          where.OR = [
            ...(existingOR ?? []),
            // Retour lié à un ticket initial du collaborateur
            {
              sourceLinks: {
                some: {
                  linkType: { contains: returnLinkType },
                  targetIssue: { assigneeJiraAccountId: { in: context.jiraAccountIds } },
                },
              },
            },
            // Fallback: retour assigné directement au collaborateur (pas de lien exploitable)
            {
              assigneeJiraAccountId: { in: context.jiraAccountIds },
              sourceLinks: {
                some: {
                  linkType: { contains: returnLinkType },
                  targetIssue: { assigneeJiraAccountId: null },
                },
              },
            },
          ];
          delete where.sourceLinks;
        } else {
          where.sourceLinks = { some: { linkType: { contains: returnLinkType } } };
        }
      }
      if (implicitFilter._noReturnLink) {
        const returnLinkType = context.returnLinkType ?? 'est un retour de';
        where.targetLinks = { none: { linkType: { contains: returnLinkType } } };
      }
      if (implicitFilter._isDevTicket) {
        const returnLinkType = context.returnLinkType ?? 'est un retour de';
        where.sourceLinks = { none: { linkType: { contains: returnLinkType } } };
      }
    }

    return where;
  }

  /**
   * Applique une ScopeRule au WHERE Prisma.
   * Modifie `where` en place.
   */
  private async applyScopeRule(
    where: Record<string, unknown>,
    rule: ScopeRule,
    context: CalculationContext,
  ): Promise<void> {
    switch (rule.type) {
      case 'resolved_in_period':
        where.resolvedAt = { gte: context.periodStart, lte: context.periodEnd };
        break;

      case 'updated_in_period':
        where.jiraUpdatedAt = { gte: context.periodStart, lte: context.periodEnd };
        break;

      case 'created_in_period':
        where.jiraCreatedAt = { gte: context.periodStart, lte: context.periodEnd };
        break;

      case 'worklogs_in_period':
        // Issues ayant un worklog dans la période,
        // OU dont une sous-tâche (via parentJiraId) a un worklog dans la période
        where.OR = [
          {
            worklogs: {
              some: { startedAt: { gte: context.periodStart, lte: context.periodEnd } },
            },
          },
          {
            jiraId: {
              in: await this.getParentJiraIdsWithChildWorklogs(context),
            },
          },
        ];
        break;

      case 'status_in_period':
        // Issues ayant transitionné vers un des statuts cibles pendant la période
        // Optionnel: fenêtre glissante sur N mois (N=1 par défaut = mois courant)
        {
          const slidingWindowMonths = this.normalizeSlidingWindowMonths(rule.slidingWindowMonths);
          const slidingWindowStart = this.getSlidingWindowStart(context.periodStart, slidingWindowMonths);

          where.transitions = {
            some: {
              toStatus: { in: rule.statuses },
              changedAt: { gte: slidingWindowStart, lte: context.periodEnd },
            },
          };
        }
        break;

      case 'sprint_in_period':
        // Issues appartenant à un sprint qui chevauche la période
        where.issueSprints = {
          some: {
            groupingEntity: {
              entityType: 'SPRINT',
              startDate: { lte: context.periodEnd },
              endDate: { gte: context.periodStart },
            },
          },
        };
        break;

      case 'combined': {
        // Combinaison AND/OR de plusieurs règles
        const subConditions = await Promise.all(rule.rules.map(async (subRule) => {
          const subWhere: Record<string, unknown> = {
            clientId: context.clientId,
            projectId: { in: context.projectIds },
          };
          await this.applyScopeRule(subWhere, subRule, context);
          return subWhere;
        }));

        if (rule.logic === 'OR') {
          where.OR = subConditions;
          // Remove clientId/projectId from parent (they're in each sub-condition)
          delete where.clientId;
          delete where.projectId;
          // Re-wrap with AND to keep client/project filter
          const wrapper = {
            AND: [
              { clientId: context.clientId, projectId: { in: context.projectIds } },
              { OR: subConditions },
            ],
          };
          Object.assign(where, wrapper);
        } else {
          where.AND = subConditions;
        }
        break;
      }
    }
  }

  /**
   * Retourne les jiraId des issues parentes dont au moins une sous-tâche
   * a un worklog dans la période.
   */
  private async getParentJiraIdsWithChildWorklogs(
    context: CalculationContext,
  ): Promise<string[]> {
    // Cache : même période + même client = même résultat, pas besoin de requêter 4 fois
    const cacheKey = `parentJiraIds_${context.clientId}_${context.periodStart.getTime()}_${context.periodEnd.getTime()}`;
    const cached = (context as Record<string, unknown>)[cacheKey] as string[] | undefined;
    if (cached) return cached;

    const where = {
      clientId: context.clientId,
      parentJiraId: { not: null },
      worklogs: {
        some: { startedAt: { gte: context.periodStart, lte: context.periodEnd } },
      },
    };

    const qStart = Date.now();
    const childIssues = await prisma.issue.findMany({
      where,
      select: { parentJiraId: true },
      distinct: ['parentJiraId'],
    });
    const qDuration = Date.now() - qStart;

    const parentIds = childIssues
      .map((i) => i.parentJiraId)
      .filter((id): id is string => id !== null);

    // Tracer cette requête intermédiaire dans le collecteur debug (une seule fois)
    const collector = context._queryCollector as QueryCollector | undefined;
    if (collector) {
      collector.startMetric('_scope_parent_ids');
      collector.addQuery('Issue', 'findMany', where as Record<string, unknown>, { parentJiraId: true }, qDuration);
      collector.endMetric(parentIds.length, parentIds.length);
    }

    // Mettre en cache
    (context as Record<string, unknown>)[cacheKey] = parentIds;

    return parentIds;
  }

  private buildWorklogWhere(context: CalculationContext): Record<string, unknown> {
    const where: Record<string, unknown> = {
      startedAt: { gte: context.periodStart, lte: context.periodEnd },
      issue: { clientId: context.clientId },
    };

    if (context.jiraAccountIds) {
      where.authorJiraAccountId = { in: context.jiraAccountIds };
    }

    return where;
  }

  private normalizeSlidingWindowMonths(value: number | undefined): number {
    if (!value || !Number.isFinite(value)) {
      return 1;
    }

    return Math.max(1, Math.min(36, Math.trunc(value)));
  }

  private getSlidingWindowStart(periodStart: Date, slidingWindowMonths: number): Date {
    const start = new Date(periodStart);
    start.setHours(0, 0, 0, 0);
    start.setDate(1);
    start.setMonth(start.getMonth() - (slidingWindowMonths - 1));
    return start;
  }
}
