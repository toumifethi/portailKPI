/**
 * Capture des requetes SQL pour le mode debug KPI.
 *
 * Approche explicite : chaque calculateur appelle addQuery() apres ses
 * requetes Prisma. Pas de middleware global (non retirable dans Prisma).
 */

/**
 * Trace capturee pour une requete Prisma.
 */
export interface CapturedQuery {
  sql: string;
  params: string;
  duration_ms: number;
}

/**
 * Trace d'une metrique avec les requetes associees.
 */
export interface MetricTrace {
  metric: string;
  queries: CapturedQuery[];
  rowCount: number | null;
  aggregatedValue: number | null;
  duration_ms: number;
}

/**
 * Collecteur de traces pendant le calcul d'un KPI.
 *
 * Usage :
 *   const collector = new QueryCollector();
 *   collector.startMetric('consomme');
 *   const issues = await prisma.issue.findMany({ where, select });
 *   collector.addQuery('issue', 'findMany', where, select, issues.length, duration);
 *   collector.endMetric(issues.length, 187.5);
 */
export class QueryCollector {
  private traces: MetricTrace[] = [];
  private currentMetric: string | null = null;
  private currentQueries: CapturedQuery[] = [];
  private metricStartTime = 0;

  startMetric(metricId: string): void {
    this.currentMetric = metricId;
    this.currentQueries = [];
    this.metricStartTime = Date.now();
  }

  /**
   * Enregistre une requete Prisma dans la metrique en cours.
   */
  addQuery(
    model: string,
    action: string,
    where: Record<string, unknown>,
    selectOrFields: Record<string, boolean> | null,
    durationMs: number,
  ): void {
    if (!this.currentMetric) return;

    const fields = selectOrFields ? Object.keys(selectOrFields).join(', ') : '*';
    const table = camelToSnake(model);
    const whereStr = formatWhere(where);

    let sql: string;
    if (action === 'count') {
      sql = `SELECT COUNT(*) FROM ${table} WHERE ${whereStr}`;
    } else {
      sql = `SELECT ${fields} FROM ${table} WHERE ${whereStr}`;
    }

    this.currentQueries.push({
      sql,
      params: JSON.stringify(where, dateReplacer, 2),
      duration_ms: durationMs,
    });
  }

  endMetric(rowCount: number | null, aggregatedValue: number | null): void {
    if (!this.currentMetric) return;

    this.traces.push({
      metric: this.currentMetric,
      queries: [...this.currentQueries],
      rowCount,
      aggregatedValue,
      duration_ms: Date.now() - this.metricStartTime,
    });

    this.currentMetric = null;
    this.currentQueries = [];
  }

  getTraces(): MetricTrace[] {
    return [...this.traces];
  }

  reset(): void {
    this.traces = [];
    this.currentMetric = null;
    this.currentQueries = [];
  }
}

// ── Formatage WHERE Prisma → SQL lisible ──

export function formatWhere(where: Record<string, unknown>, depth = 0): string {
  if (depth > 4) return '...';
  const parts: string[] = [];

  for (const [key, value] of Object.entries(where)) {
    if (key === 'AND' && Array.isArray(value)) {
      const sub = value.map((v) => formatWhere(v as Record<string, unknown>, depth + 1));
      parts.push(`(${sub.join(' AND ')})`);
    } else if (key === 'OR' && Array.isArray(value)) {
      const sub = value.map((v) => formatWhere(v as Record<string, unknown>, depth + 1));
      parts.push(`(${sub.join(' OR ')})`);
    } else if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
      const obj = value as Record<string, unknown>;
      if ('in' in obj) {
        const vals = Array.isArray(obj.in) ? obj.in : [obj.in];
        parts.push(`${camelToSnake(key)} IN (${vals.map(fmtVal).join(', ')})`);
      } else if ('notIn' in obj) {
        const vals = Array.isArray(obj.notIn) ? obj.notIn : [obj.notIn];
        parts.push(`${camelToSnake(key)} NOT IN (${vals.map(fmtVal).join(', ')})`);
      } else if ('gte' in obj && 'lte' in obj) {
        parts.push(`${camelToSnake(key)} BETWEEN ${fmtVal(obj.gte)} AND ${fmtVal(obj.lte)}`);
      } else if ('gte' in obj) {
        parts.push(`${camelToSnake(key)} >= ${fmtVal(obj.gte)}`);
      } else if ('lte' in obj) {
        parts.push(`${camelToSnake(key)} <= ${fmtVal(obj.lte)}`);
      } else if ('not' in obj) {
        parts.push(`${camelToSnake(key)} != ${fmtVal(obj.not)}`);
      } else if ('contains' in obj) {
        parts.push(`${camelToSnake(key)} LIKE '%${obj.contains}%'`);
      } else if ('equals' in obj) {
        parts.push(`${camelToSnake(key)} = ${fmtVal(obj.equals)}`);
      } else if ('some' in obj) {
        const sub = formatWhere(obj.some as Record<string, unknown>, depth + 1);
        parts.push(`EXISTS (${camelToSnake(key)} WHERE ${sub})`);
      } else if ('none' in obj) {
        const sub = formatWhere(obj.none as Record<string, unknown>, depth + 1);
        parts.push(`NOT EXISTS (${camelToSnake(key)} WHERE ${sub})`);
      } else {
        // Relation traversal (ex: { issue: { clientId: 1 } })
        const sub = formatWhere(obj, depth + 1);
        parts.push(`${camelToSnake(key)}.${sub}`);
      }
    } else {
      parts.push(`${camelToSnake(key)} = ${fmtVal(value)}`);
    }
  }

  return parts.join(' AND ') || '1=1';
}

function fmtVal(v: unknown): string {
  if (v === null || v === undefined) return 'NULL';
  if (v instanceof Date) return `'${v.toISOString().slice(0, 10)}'`;
  if (typeof v === 'string') return `'${v}'`;
  return String(v);
}

function camelToSnake(str: string): string {
  return str.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '');
}

function dateReplacer(_key: string, value: unknown): unknown {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return value;
}
