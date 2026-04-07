import { KpiCalculator, EMPTY_RESULT } from '../KpiCalculator';
import { FinalKpiConfig, CalculationContext, KpiCalculationResult } from '@/types/domain';
import { prisma } from '@/db/prisma';
import { AiRule } from '@prisma/client';

/**
 * KPI : Tickets développés avec IA
 * Valeur principale : pourcentage = (tickets IA / (total terminés - exclus)) × 100
 * Valeur brute (ticketCount) : nombre absolu de tickets avec IA.
 *
 * Les règles de comptage (COMPTE_COMME_IA / NON_IA / EXCLUT) sont lues
 * depuis kpi_ai_field_rules pour ce (KPI × client) — cf. RMG-088 à RMG-093.
 */
export class CountWithAi implements KpiCalculator {
  async calculate(config: FinalKpiConfig, context: CalculationContext): Promise<KpiCalculationResult> {
    const doneStatuses = config.done_statuses ?? [];
    const aiFieldId = config.ai_field_id;
    const includedTypes = config.included_issue_types ?? [];
    const excludedTypes = config.excluded_issue_types ?? [];

    if (doneStatuses.length === 0 || !aiFieldId) return EMPTY_RESULT;

    // Charger les règles IA pour cette config
    // Note : kpiClientConfigId est résolu par le moteur avant d'appeler calculate()
    // On passe ici par context.kpiClientConfigId (à ajouter dans CalculationContext si besoin)
    // Pour l'instant, les règles sont injectées via config.aiRules (enrichi par le moteur)
    const aiRules: Array<{ fieldValue: string | null; rule: AiRule }> =
      (config as unknown as { aiRules: Array<{ fieldValue: string | null; rule: AiRule }> }).aiRules ?? [];

    const ruleMap = new Map<string | null, AiRule>(
      aiRules.map((r) => [r.fieldValue, r.rule]),
    );
    const defaultRule: AiRule = ruleMap.get(null) ?? 'NON_IA';

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
        ...(context.jiraAccountIds && { assigneeJiraAccountId: { in: context.jiraAccountIds } }),
      },
      select: { jiraKey: true, customFields: true },
    });

    let aiCount = 0;
    let excluded = 0;
    let total = 0;

    for (const issue of issues) {
      const customFields = (issue.customFields as Record<string, unknown>) ?? {};
      const rawValue = customFields[aiFieldId];
      const fieldValue = rawValue != null ? String(rawValue) : null;

      const rule = ruleMap.get(fieldValue) ?? defaultRule;

      if (rule === 'EXCLUT') {
        excluded++;
        continue;
      }

      total++;
      if (rule === 'COMPTE_COMME_IA') aiCount++;
    }

    if (total === 0) return EMPTY_RESULT;

    const percentage = (aiCount / total) * 100;

    return {
      value: Math.round(percentage * 100) / 100,
      ticketCount: aiCount,           // valeur brute : nb tickets IA
      excludedTicketCount: excluded,
      excludedTicketDetails: [],
    };
  }
}
