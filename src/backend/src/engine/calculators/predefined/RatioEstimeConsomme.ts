import { KpiCalculator, EMPTY_RESULT } from '../KpiCalculator';
import { FinalKpiConfig, CalculationContext, KpiCalculationResult, ExcludedTicket } from '@/types/domain';
import { prisma } from '@/db/prisma';

/**
 * KPI : Respect des charges
 * Formule : moyenne des écarts (%) = (temps_consommé - estimation_initiale) / estimation_initiale × 100
 * Périmètre : tickets dont le statut est dans done_statuses, assignés au collaborateur, sur la période.
 *
 * Règles : RMG-030 à RMG-037
 */
export class RatioEstimeConsomme implements KpiCalculator {
  async calculate(config: FinalKpiConfig, context: CalculationContext): Promise<KpiCalculationResult> {
    const doneStatuses = config.done_statuses ?? [];
    const includedTypes = config.included_issue_types ?? [];
    const excludedTypes = config.excluded_issue_types ?? [];
    const includeSubtasks = config.include_subtasks ?? false;
    const aggregation = config.aggregation_rule ?? 'AVG';

    if (doneStatuses.length === 0) return EMPTY_RESULT;

    // Récupère les tickets terminés sur la période pour ce client
    const issues = await prisma.issue.findMany({
      where: {
        clientId: context.clientId,
        projectId: { in: context.projectIds },
        status: { in: doneStatuses },
        resolvedAt: {
          gte: context.periodStart,
          lte: context.periodEnd,
        },
        ...(includedTypes.length > 0 && { issueType: { in: includedTypes } }),
        ...(excludedTypes.length > 0 && { issueType: { notIn: excludedTypes } }),
        ...(!includeSubtasks && { issueType: { not: 'Sub-task' } }),
        ...(context.jiraAccountIds && { assigneeJiraAccountId: { in: context.jiraAccountIds } }),
      },
      include: {
        worklogs: true,
      },
    });

    const excluded: ExcludedTicket[] = [];
    const ecarts: number[] = [];

    for (const issue of issues) {
      // RMG-033 : exclure les tickets sans estimation
      if (!issue.originalEstimateHours || Number(issue.originalEstimateHours) === 0) {
        excluded.push({ jiraKey: issue.jiraKey, reason: 'MISSING_ESTIMATE' });
        continue;
      }

      const estimateHours = Number(issue.originalEstimateHours);

      // Temps consommé : somme des worklogs en heures
      const timeSpentHours = issue.worklogs.reduce(
        (sum, w) => sum + w.timeSpentSeconds / 3600,
        0,
      );

      // RMG-034 : temps consommé = 0 → écart = -100%
      const ecart = ((timeSpentHours - estimateHours) / estimateHours) * 100;
      ecarts.push(ecart);
    }

    if (ecarts.length === 0) return { ...EMPTY_RESULT, excludedTicketCount: excluded.length, excludedTicketDetails: excluded };

    const value =
      aggregation === 'AVG'
        ? ecarts.reduce((a, b) => a + b, 0) / ecarts.length
        : ecarts.reduce((a, b) => a + b, 0);

    return {
      value: Math.round(value * 100) / 100,
      ticketCount: ecarts.length,
      excludedTicketCount: excluded.length,
      excludedTicketDetails: excluded,
    };
  }
}
