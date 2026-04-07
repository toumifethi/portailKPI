import { KpiCalculator, EMPTY_RESULT } from '../KpiCalculator';
import { FinalKpiConfig, CalculationContext, KpiCalculationResult } from '@/types/domain';
import { prisma } from '@/db/prisma';

/**
 * KPI : Somme d'un champ numérique (SUM_FIELD)
 * Additionne la valeur d'un champ numérique sur les tickets filtrés.
 */
export class SumField implements KpiCalculator {
  async calculate(config: FinalKpiConfig, context: CalculationContext): Promise<KpiCalculationResult> {
    const targetStatuses = config.done_statuses ?? [];
    const fieldName = config.estimate_field ?? 'originalEstimateHours';
    const includedTypes = config.included_issue_types ?? [];

    if (targetStatuses.length === 0) return EMPTY_RESULT;

    const issues = await prisma.issue.findMany({
      where: {
        clientId: context.clientId,
        projectId: { in: context.projectIds },
        status: { in: targetStatuses },
        jiraUpdatedAt: { gte: context.periodStart, lte: context.periodEnd },
        ...(includedTypes.length > 0 && { issueType: { in: includedTypes } }),
        ...(context.jiraAccountIds && { assigneeJiraAccountId: { in: context.jiraAccountIds } }),
      },
      select: { originalEstimateHours: true, timeSpentSeconds: true, storyPoints: true, customFields: true },
    });

    let sum = 0;
    let count = 0;

    for (const issue of issues) {
      let val: number | null = null;
      if (fieldName === 'originalEstimateHours') val = issue.originalEstimateHours ? Number(issue.originalEstimateHours) : null;
      else if (fieldName === 'storyPoints') val = issue.storyPoints ? Number(issue.storyPoints) : null;
      else {
        const cf = (issue.customFields as Record<string, unknown>) ?? {};
        val = typeof cf[fieldName] === 'number' ? (cf[fieldName] as number) : null;
      }
      if (val !== null) { sum += val; count++; }
    }

    return { value: Math.round(sum * 100) / 100, ticketCount: count, excludedTicketCount: issues.length - count, excludedTicketDetails: [] };
  }
}
