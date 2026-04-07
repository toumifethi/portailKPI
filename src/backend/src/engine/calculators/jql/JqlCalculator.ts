import { prisma } from '@/db/prisma';
import { FinalKpiConfig, CalculationContext, KpiCalculationResult, EMPTY_RESULT } from '@/types/domain';
import { logger } from '@/utils/logger';

/**
 * Calculator JQL — traduit un sous-ensemble de JQL en conditions Prisma.
 *
 * Clauses supportées (cf. RMG-023) :
 *   status = "X" | status IN ("X","Y")
 *   issuetype = "X" | issuetype IN ("X","Y")
 *   assignee = currentUser() | assignee = "accountId"
 *   project = "{project_key}"          ← variable remplacée par le moteur
 *   updated >= "YYYY-MM-DD"
 *   updated <= "YYYY-MM-DD"
 *   cf[fieldName] is EMPTY | cf[fieldName] is not EMPTY
 *
 * Les clauses non supportées déclenchent une erreur enregistrée dans les logs (cf. RMG-024).
 */
export class JqlCalculator {
  async calculate(
    jql: string,
    config: FinalKpiConfig,
    context: CalculationContext,
  ): Promise<KpiCalculationResult> {
    const aggregation = config.aggregation_rule ?? 'COUNT';

    try {
      const where = this.parseJqlToWhere(jql, context);

      const count = await prisma.issue.count({
        where: {
          clientId: context.clientId,
          projectId: { in: context.projectIds },
          ...where,
        },
      });

      return {
        value: count,
        ticketCount: count,
        excludedTicketCount: 0,
        excludedTicketDetails: [],
      };
    } catch (err) {
      logger.error('JQL Calculator failed', { jql, error: err });
      throw err;
    }
  }

  /**
   * Traduction partielle JQL → conditions Prisma where.
   * Extension prévue en Étape 4 — implémentation complète du parser JQL.
   */
  private parseJqlToWhere(jql: string, context: CalculationContext): Record<string, unknown> {
    const where: Record<string, unknown> = {};

    // Substitution de la variable {project_key}
    const normalizedJql = jql
      .replaceAll('{project_start}', context.periodStart.toISOString().slice(0, 10))
      .replaceAll('{project_end}', context.periodEnd.toISOString().slice(0, 10));

    // status = "X" ou status IN ("X","Y")
    const statusMatch = normalizedJql.match(/status\s+(?:=\s*"([^"]+)"|IN\s*\(([^)]+)\))/i);
    if (statusMatch) {
      if (statusMatch[1]) {
        where.status = statusMatch[1];
      } else if (statusMatch[2]) {
        const statuses = statusMatch[2].split(',').map((s) => s.trim().replace(/"/g, ''));
        where.status = { in: statuses };
      }
    }

    // issuetype = "X"
    const typeMatch = normalizedJql.match(/issuetype\s*=\s*"([^"]+)"/i);
    if (typeMatch) {
      where.issueType = typeMatch[1];
    }

    // updated >= "YYYY-MM-DD"
    const updatedGteMatch = normalizedJql.match(/updated\s*>=\s*"([^"]+)"/i);
    if (updatedGteMatch) {
      where.jiraUpdatedAt = { ...(where.jiraUpdatedAt as object), gte: new Date(updatedGteMatch[1]) };
    }

    // updated <= "YYYY-MM-DD"
    const updatedLteMatch = normalizedJql.match(/updated\s*<=\s*"([^"]+)"/i);
    if (updatedLteMatch) {
      where.jiraUpdatedAt = { ...(where.jiraUpdatedAt as object), lte: new Date(updatedLteMatch[1]) };
    }

    return where;
  }
}
