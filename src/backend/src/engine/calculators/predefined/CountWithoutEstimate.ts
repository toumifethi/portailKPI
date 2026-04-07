import { KpiCalculator, EMPTY_RESULT } from '../KpiCalculator';
import { FinalKpiConfig, CalculationContext, KpiCalculationResult } from '@/types/domain';
import { prisma } from '@/db/prisma';

/**
 * KPI : Tickets sans estimation
 * Valeur : nombre de tickets "en cours" (statuts configurables) sans estimation initiale.
 * Règles : RMG-082 à RMG-087
 */
export class CountWithoutEstimate implements KpiCalculator {
  async calculate(config: FinalKpiConfig, context: CalculationContext): Promise<KpiCalculationResult> {
    const inProgressStatuses = config.in_progress_statuses ?? [];
    const includedTypes = config.included_issue_types ?? [];
    const excludedTypes = config.excluded_issue_types ?? [];

    if (inProgressStatuses.length === 0) return EMPTY_RESULT;

    const userFilter = context.jiraAccountIds ? { assigneeJiraAccountId: { in: context.jiraAccountIds } } : {};

    const total = await prisma.issue.count({
      where: {
        clientId: context.clientId,
        projectId: { in: context.projectIds },
        status: { in: inProgressStatuses },
        jiraUpdatedAt: { lte: context.periodEnd },
        ...(includedTypes.length > 0 && { issueType: { in: includedTypes } }),
        ...(excludedTypes.length > 0 && { issueType: { notIn: excludedTypes } }),
        ...userFilter,
      },
    });

    const withoutEstimate = await prisma.issue.count({
      where: {
        clientId: context.clientId,
        projectId: { in: context.projectIds },
        status: { in: inProgressStatuses },
        jiraUpdatedAt: { lte: context.periodEnd },
        OR: [
          { originalEstimateHours: null },
          { originalEstimateHours: { equals: 0 } },
        ],
        ...(includedTypes.length > 0 && { issueType: { in: includedTypes } }),
        ...(excludedTypes.length > 0 && { issueType: { notIn: excludedTypes } }),
        ...userFilter,
      },
    });

    return {
      value: withoutEstimate,
      ticketCount: total,
      excludedTicketCount: 0,
      excludedTicketDetails: [],
    };
  }
}
