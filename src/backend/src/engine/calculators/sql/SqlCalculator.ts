import { prisma } from '@/db/prisma';
import { config } from '@/config';
import { CalculationContext, KpiCalculationResult, EMPTY_RESULT } from '@/types/domain';
import { logger } from '@/utils/logger';

// Mots-clés interdits — requêtes en lecture seule uniquement (cf. RMG-027)
const FORBIDDEN_KEYWORDS = /\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|CREATE|GRANT|REVOKE)\b/i;

export class SqlCalculator {
  /**
   * Exécute une requête SQL custom (mode SQL libre ou formula_override).
   * Retourne le premier champ du premier enregistrement comme valeur KPI.
   */
  async calculate(sql: string, context: CalculationContext): Promise<KpiCalculationResult> {
    return this.runSql(sql, context);
  }

  async runOverride(sql: string, context: CalculationContext): Promise<KpiCalculationResult> {
    return this.runSql(sql, context);
  }

  private async runSql(sql: string, context: CalculationContext): Promise<KpiCalculationResult> {
    if (FORBIDDEN_KEYWORDS.test(sql)) {
      throw new Error('SQL KPI: forbidden keyword detected. Only SELECT queries are allowed.');
    }

    try {
      // Exécution avec timeout via query timeout MySQL (requires MySQL 8.0+)
      const timeoutSql = `SET SESSION MAX_EXECUTION_TIME=${config.SQL_KPI_TIMEOUT_MS}`;
      await prisma.$executeRawUnsafe(timeoutSql);

      // Substitution des paramètres de contexte
      const parameterizedSql = sql
        .replaceAll(':client_id', String(context.clientId))
        .replaceAll(':period_start', `'${context.periodStart.toISOString().slice(0, 10)}'`)
        .replaceAll(':period_end', `'${context.periodEnd.toISOString().slice(0, 10)}'`);

      const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(parameterizedSql);

      if (!rows || rows.length === 0) return EMPTY_RESULT;

      const firstRow = rows[0];
      const firstValue = Object.values(firstRow)[0];
      const value = typeof firstValue === 'number' ? firstValue : Number(firstValue) || null;

      return {
        value,
        ticketCount: rows.length,
        excludedTicketCount: 0,
        excludedTicketDetails: [],
      };
    } catch (err) {
      logger.error('SQL KPI execution failed', { error: err, sql });
      throw err;
    }
  }
}
