export interface Period {
  start: Date;
  end: Date;
  label: string; // ex. "2026-01"
}

/**
 * Génère les N dernières périodes mensuelles à partir d'une date de référence.
 */
export function generatePeriods(
  periodType: 'MONTHLY' | 'QUARTERLY' | 'YEARLY',
  referenceDate: Date,
  count = 13,
): Period[] {
  const periods: Period[] = [];

  for (let i = 0; i < count; i++) {
    const d = new Date(referenceDate);

    if (periodType === 'MONTHLY') {
      d.setMonth(d.getMonth() - i);
      const start = new Date(d.getFullYear(), d.getMonth(), 1);
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
      periods.push({
        start,
        end,
        label: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`,
      });
    } else if (periodType === 'QUARTERLY') {
      const quarter = Math.floor(d.getMonth() / 3) - i;
      const year = d.getFullYear() + Math.floor(quarter / 4);
      const q = ((quarter % 4) + 4) % 4;
      const start = new Date(year, q * 3, 1);
      const end = new Date(year, q * 3 + 3, 0, 23, 59, 59);
      periods.push({ start, end, label: `${year}-Q${q + 1}` });
    }
  }

  return periods.reverse(); // chronologique
}
