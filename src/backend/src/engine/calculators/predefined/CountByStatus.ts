import { KpiCalculator, EMPTY_RESULT } from '../KpiCalculator';
import { FinalKpiConfig, CalculationContext, KpiCalculationResult } from '@/types/domain';
import { prisma } from '@/db/prisma';

/**
 * KPI : Comptage par statut (COUNT_BY_STATUS)
 * Valeur : nombre de tickets dans les statuts configurés sur la période.
 */
export class CountByStatus implements KpiCalculator {
  async calculate(config: FinalKpiConfig, context: CalculationContext): Promise<KpiCalculationResult> {
    const targetStatuses = config.done_statuses ?? [];
    const includedTypes = config.included_issue_types ?? [];
    const excludedTypes = config.excluded_issue_types ?? [];

    if (targetStatuses.length === 0) return EMPTY_RESULT;

    const count = await prisma.issue.count({
      where: {
        clientId: context.clientId,
        projectId: { in: context.projectIds },
        status: { in: targetStatuses },
        jiraUpdatedAt: {
          gte: context.periodStart,
          lte: context.periodEnd,
        },
        ...(includedTypes.length > 0 && { issueType: { in: includedTypes } }),
        ...(excludedTypes.length > 0 && { issueType: { notIn: excludedTypes } }),
        ...(context.jiraAccountIds && { assigneeJiraAccountId: { in: context.jiraAccountIds } }),
      },
    });

    return { value: count, ticketCount: count, excludedTicketCount: 0, excludedTicketDetails: [] };
  }
}
