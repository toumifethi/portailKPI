/**
 * Calcule la prochaine date d'exécution d'une cron expression (5 champs standard).
 * Format : minute heure jour_du_mois mois jour_de_la_semaine
 *
 * Supporte : valeurs fixes, *, listes (1,4), intervalles (star/5).
 * Cherche par force brute minute par minute sur les 7 prochains jours max.
 */
export function computeNextRun(cronExpression: string, after?: Date): Date {
  const now = after ?? new Date();
  const parts = cronExpression.trim().split(/\s+/);
  if (parts.length !== 5) throw new Error(`Invalid cron expression: ${cronExpression}`);

  const minuteSet = parseCronField(parts[0], 0, 59);
  const hourSet = parseCronField(parts[1], 0, 23);
  const domSet = parseCronField(parts[2], 1, 31);
  const monthSet = parseCronField(parts[3], 1, 12);
  const dowSet = parseCronField(parts[4], 0, 7); // 0 et 7 = dimanche

  // Normaliser dow : 7 → 0
  const normalizedDow = new Set([...dowSet].map((d) => (d === 7 ? 0 : d)));

  // Chercher la prochaine minute qui matche (max 7 jours = 10080 minutes)
  const candidate = new Date(now);
  candidate.setSeconds(0);
  candidate.setMilliseconds(0);
  candidate.setMinutes(candidate.getMinutes() + 1); // commencer à la minute suivante

  const maxIterations = 7 * 24 * 60; // 7 jours

  for (let i = 0; i < maxIterations; i++) {
    const m = candidate.getMinutes();
    const h = candidate.getHours();
    const dom = candidate.getDate();
    const month = candidate.getMonth() + 1; // JS 0-indexed
    const dow = candidate.getDay(); // 0 = dimanche

    if (
      minuteSet.has(m) &&
      hourSet.has(h) &&
      domSet.has(dom) &&
      monthSet.has(month) &&
      normalizedDow.has(dow)
    ) {
      return candidate;
    }

    candidate.setMinutes(candidate.getMinutes() + 1);
  }

  // Fallback : 24h plus tard
  const fallback = new Date(now);
  fallback.setDate(fallback.getDate() + 1);
  return fallback;
}

/**
 * Parse un champ cron en un Set de valeurs valides.
 * Supporte : * , star/N , N , N-M , N,M,O
 */
function parseCronField(field: string, min: number, max: number): Set<number> {
  const values = new Set<number>();

  for (const part of field.split(',')) {
    if (part === '*') {
      for (let i = min; i <= max; i++) values.add(i);
    } else if (part.includes('/')) {
      const [range, stepStr] = part.split('/');
      const step = Number(stepStr);
      const start = range === '*' ? min : Number(range);
      for (let i = start; i <= max; i += step) values.add(i);
    } else if (part.includes('-')) {
      const [fromStr, toStr] = part.split('-');
      const from = Number(fromStr);
      const to = Number(toStr);
      for (let i = from; i <= to; i++) values.add(i);
    } else {
      values.add(Number(part));
    }
  }

  return values;
}
