import { prisma } from '@/db/prisma';
import { config } from '@/config';
import { CalculationContext, KpiCalculationResult, EMPTY_RESULT } from '@/types/domain';
import { logger } from '@/utils/logger';

// Mots-clés interdits — requêtes en lecture seule uniquement (cf. RMG-027)
const FORBIDDEN_KEYWORDS = /\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|CREATE|GRANT|REVOKE)\b/i;

// Colonnes retournées par getMatchingIssues
const ISSUE_DETAIL_COLUMNS = [
  'i.id', 'i.jiraKey', 'i.summary', 'i.issueType', 'i.status',
  'i.assigneeJiraAccountId',
  'i.originalEstimateHours',
  'i.timeSpentSeconds',
  'i.rollupEstimateHours',
  'i.rollupTimeSpentHours',
  'i.rollupRemainingHours',
].join(', ');

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

  /**
   * Retourne les issues individuelles qui correspondent aux conditions du SQL KPI.
   * Transforme le SELECT agrégé en SELECT DISTINCT des colonnes issue.
   */
  async getMatchingIssues(sql: string, context: CalculationContext): Promise<Array<{
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
    if (FORBIDDEN_KEYWORDS.test(sql)) {
      throw new Error('SQL KPI: forbidden keyword detected.');
    }

    // Transformer : remplacer le SELECT ... FROM issues par SELECT DISTINCT des colonnes détail
    // Supprimer aussi GROUP BY éventuel
    const issuesSql = sql
      .replace(/SELECT[\s\S]*?FROM\s+issues\s+i/i, `SELECT DISTINCT ${ISSUE_DETAIL_COLUMNS} FROM issues i`)
      .replace(/GROUP\s+BY\s+[^\s;)]+/gi, '');

    const parameterizedSql = this.substituteParams(issuesSql, context);

    try {
      await prisma.$executeRawUnsafe(`SET SESSION MAX_EXECUTION_TIME=${config.SQL_KPI_TIMEOUT_MS}`);

      const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(parameterizedSql + ' LIMIT 500');

      return rows.map((r) => ({
        id: Number(r.id),
        jiraKey: String(r.jiraKey ?? ''),
        summary: String(r.summary ?? ''),
        issueType: String(r.issueType ?? ''),
        status: String(r.status ?? ''),
        assigneeJiraAccountId: r.assigneeJiraAccountId ? String(r.assigneeJiraAccountId) : null,
        originalEstimateHours: r.originalEstimateHours != null ? Number(r.originalEstimateHours) : null,
        timeSpentSeconds: r.timeSpentSeconds != null ? Number(r.timeSpentSeconds) : null,
        rollupEstimateHours: r.rollupEstimateHours != null ? Number(r.rollupEstimateHours) : null,
        rollupTimeSpentHours: r.rollupTimeSpentHours != null ? Number(r.rollupTimeSpentHours) : null,
        rollupRemainingHours: r.rollupRemainingHours != null ? Number(r.rollupRemainingHours) : null,
      }));
    } catch (err) {
      logger.error('SQL KPI getMatchingIssues failed', { error: err, sql: parameterizedSql });
      throw err;
    }
  }

  private substituteParams(sql: string, context: CalculationContext): string {
    const projectIdsList = context.projectIds.length > 0
      ? context.projectIds.join(',')
      : '0';
    const jiraAccountIdsList = context.jiraAccountIds && context.jiraAccountIds.length > 0
      ? context.jiraAccountIds.map((id) => `'${id.replace(/'/g, "''")}'`).join(',')
      : "''";

    return sql
      .replaceAll(':client_id', String(context.clientId))
      .replaceAll(':period_start', `'${context.periodStart.toISOString().slice(0, 10)}'`)
      .replaceAll(':period_end', `'${context.periodEnd.toISOString().slice(0, 10)}'`)
      .replaceAll(':project_ids', projectIdsList)
      .replaceAll(':collaborator_id', context.collaboratorId != null ? String(context.collaboratorId) : 'NULL')
      .replaceAll(':jira_account_ids', jiraAccountIdsList);
  }

  private async runSql(sql: string, context: CalculationContext): Promise<KpiCalculationResult> {
    if (FORBIDDEN_KEYWORDS.test(sql)) {
      throw new Error('SQL KPI: forbidden keyword detected. Only SELECT queries are allowed.');
    }

    try {
      // Exécution avec timeout via query timeout MySQL (requires MySQL 8.0+)
      const timeoutSql = `SET SESSION MAX_EXECUTION_TIME=${config.SQL_KPI_TIMEOUT_MS}`;
      await prisma.$executeRawUnsafe(timeoutSql);

      const parameterizedSql = this.substituteParams(sql, context);

      const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(parameterizedSql);

      if (!rows || rows.length === 0) return EMPTY_RESULT;

      const firstRow = rows[0];

      // Lire la colonne 'value' en priorité, sinon le premier champ
      const value = firstRow.value !== undefined
        ? (typeof firstRow.value === 'number' ? firstRow.value : Number(firstRow.value) || null)
        : (() => { const v = Object.values(firstRow)[0]; return typeof v === 'number' ? v : Number(v) || null; })();

      // Lire la colonne 'ticketCount' si elle existe dans le résultat SQL
      const ticketCount = firstRow.ticketCount !== undefined
        ? Number(firstRow.ticketCount) || 0
        : rows.length;

      return {
        value,
        ticketCount,
        excludedTicketCount: 0,
        excludedTicketDetails: [],
      };
    } catch (err) {
      logger.error('SQL KPI execution failed', { error: err, sql });
      throw err;
    }
  }
}
