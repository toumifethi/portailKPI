import { KpiCalculator, EMPTY_RESULT } from '../KpiCalculator';
import { FinalKpiConfig, CalculationContext, KpiCalculationResult, ExcludedTicket } from '@/types/domain';
import { prisma } from '@/db/prisma';

/**
 * KPI : Qualité (ratio retours)
 * Formule : ratio_qualité (%) = sum(temps retours liés) / estimation_initiale_ticket_principal × 100
 * Agrégation : moyenne par collaborateur sur la période.
 *
 * Règle d'imputation (RMG-041bis) :
 * Le temps des retours est imputé au développeur identifié via return_imputation_field
 * sur le ticket PRINCIPAL (pas l'assignee du ticket de retour).
 * Fallback : assignee courant du ticket principal → si absent, retour exclu.
 *
 * Règles : RMG-038 à RMG-045, RMG-041bis
 */
export class RatioRetours implements KpiCalculator {
  async calculate(config: FinalKpiConfig, context: CalculationContext): Promise<KpiCalculationResult> {
    const doneStatuses = config.done_statuses ?? [];
    const returnLinkType = config.return_link_type ?? 'is caused by';
    const returnTypes = [
      ...(config.return_internal_issue_types ?? []),
      ...(config.return_client_issue_types ?? []),
    ];
    // Champ JIRA à lire sur le ticket principal pour identifier le dev initial (cf. RMG-041bis)
    const imputationField = config.return_imputation_field ?? 'assignee';
    const aggregation = config.aggregation_rule ?? 'AVG';

    if (doneStatuses.length === 0 || returnTypes.length === 0) return EMPTY_RESULT;

    const issues = await prisma.issue.findMany({
      where: {
        clientId: context.clientId,
        projectId: { in: context.projectIds },
        status: { in: doneStatuses },
        resolvedAt: {
          gte: context.periodStart,
          lte: context.periodEnd,
        },
        ...(context.jiraAccountIds && { assigneeJiraAccountId: { in: context.jiraAccountIds } }),
      },
      include: {
        // Liens sortants du ticket principal vers les retours
        sourceLinks: {
          where: { linkType: returnLinkType },
          include: {
            targetIssue: {
              include: { worklogs: true },
            },
          },
        },
      },
    });

    const excluded: ExcludedTicket[] = [];
    const ratios: number[] = [];

    for (const issue of issues) {
      // RMG-043 : exclure sans estimation
      if (!issue.originalEstimateHours || Number(issue.originalEstimateHours) === 0) {
        excluded.push({ jiraKey: issue.jiraKey, reason: 'MISSING_ESTIMATE' });
        continue;
      }

      // Filtrer les tickets liés qui sont bien des retours
      const returnIssues = issue.sourceLinks
        .map((l) => l.targetIssue)
        .filter((t) => returnTypes.includes(t.issueType));

      if (returnIssues.length === 0) continue;

      // Résoudre le développeur à qui imputer (RMG-041bis)
      let imputedAccountId: string | null = null;
      if (imputationField === 'assignee') {
        imputedAccountId = issue.assigneeJiraAccountId;
      } else {
        // Lire le champ personnalisé depuis customFields JSON
        const customFields = (issue.customFields as Record<string, unknown>) ?? {};
        const fieldValue = customFields[imputationField];
        if (typeof fieldValue === 'string') {
          imputedAccountId = fieldValue;
        } else if (fieldValue && typeof fieldValue === 'object' && 'accountId' in fieldValue) {
          imputedAccountId = (fieldValue as { accountId: string }).accountId;
        }
        // Fallback sur assignee courant si champ absent
        if (!imputedAccountId) {
          imputedAccountId = issue.assigneeJiraAccountId;
        }
      }

      if (!imputedAccountId) {
        excluded.push({ jiraKey: issue.jiraKey, reason: 'MISSING_IMPUTATION_USER' });
        continue;
      }

      const totalRetourSeconds = returnIssues.reduce(
        (sum, r) => sum + r.worklogs.reduce((s, w) => s + w.timeSpentSeconds, 0),
        0,
      );

      const ratio =
        (totalRetourSeconds / 3600 / Number(issue.originalEstimateHours)) * 100;

      ratios.push(ratio);
    }

    if (ratios.length === 0) return { ...EMPTY_RESULT, excludedTicketCount: excluded.length, excludedTicketDetails: excluded };

    const value =
      aggregation === 'AVG'
        ? ratios.reduce((a, b) => a + b, 0) / ratios.length
        : ratios.reduce((a, b) => a + b, 0);

    return {
      value: Math.round(value * 100) / 100,
      ticketCount: ratios.length,
      excludedTicketCount: excluded.length,
      excludedTicketDetails: excluded,
    };
  }
}
