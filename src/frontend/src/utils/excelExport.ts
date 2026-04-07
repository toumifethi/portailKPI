import * as XLSX from 'xlsx';
import { dashboardApi, kpiApi } from '@/api/endpoints';

interface HeatmapData {
  kpiName: string;
  unit: string | null;
  periods: string[];
  collaborators: Array<{
    id: number;
    name: string;
    values: Record<string, number | null>;
  }>;
  teamAverage: Record<string, number | null>;
}

/**
 * Export Excel pour UN client : 1 onglet par KPI, colonnes = Client | Collaborateur | mois...
 */
export async function exportClientKpisToExcel(
  clientId: number,
  clientName: string,
  months: number = 12,
): Promise<void> {
  const configs = await kpiApi.getConfigs(clientId);
  const activeConfigs = configs.filter((c) => c.isActive);

  if (!activeConfigs.length) {
    alert('Aucun KPI actif pour ce client.');
    return;
  }

  const wb = XLSX.utils.book_new();

  const results = await Promise.all(
    activeConfigs.map(async (config) => {
      try {
        const data: HeatmapData = await dashboardApi.getTeamHeatmapHistory(clientId, config.id, months);
        return { config, data };
      } catch {
        return { config, data: null };
      }
    }),
  );

  for (const { config, data } of results) {
    if (!data || !data.collaborators.length) continue;

    const kpiName = config.kpiDefinition?.name ?? `KPI #${config.id}`;
    const unit = data.unit ?? '';

    // Build rows: [Client, Collaborateur, period1, period2, ...]
    const headers = ['Client', 'Collaborateur', ...data.periods.map((p) => p)];
    const rows: (string | number | null)[][] = [];

    for (const collab of data.collaborators) {
      rows.push([
        clientName,
        collab.name,
        ...data.periods.map((p) => collab.values[p] ?? null),
      ]);
    }

    // Team average row
    rows.push([
      clientName,
      'MOYENNE EQUIPE',
      ...data.periods.map((p) => data.teamAverage[p] ?? null),
    ]);

    const wsData = [headers, ...rows];
    const ws = XLSX.utils.aoa_to_sheet(wsData);

    // Auto-width columns
    ws['!cols'] = headers.map((h, i) => ({
      wch: i <= 1 ? Math.max(h.length, 20) : 10,
    }));

    // Sanitize sheet name (max 31 chars, no special chars)
    const sheetName = sanitizeSheetName(unit ? `${kpiName} (${unit})` : kpiName);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  }

  if (!wb.SheetNames.length) {
    alert('Aucune donnée à exporter.');
    return;
  }

  XLSX.writeFile(wb, `KPI_${sanitizeFilename(clientName)}_${months}mois.xlsx`);
}

/**
 * Export Excel CROSS-CLIENT : 1 onglet par KPI, colonnes = Client | mois...
 * Utilise l'endpoint cross-client (valeurs agrégées par client).
 */
export async function exportCrossClientKpisToExcel(months: number = 12): Promise<void> {
  const definitions = await kpiApi.getDefinitions();

  if (!definitions.length) {
    alert('Aucune définition KPI trouvée.');
    return;
  }

  const wb = XLSX.utils.book_new();

  const results = await Promise.all(
    definitions.map(async (def) => {
      try {
        const data = await dashboardApi.getCrossClient(def.id, months);
        return { def, data };
      } catch {
        return { def, data: null };
      }
    }),
  );

  for (const { def, data } of results) {
    if (!data || !data.clients.length) continue;

    const headers = ['Client', ...data.periods];
    const rows: (string | number | null)[][] = [];

    for (const client of data.clients) {
      rows.push([
        client.clientName,
        ...data.periods.map((p) => {
          const point = client.series.find((s) => s.period === p);
          return point?.value ?? null;
        }),
      ]);
    }

    const wsData = [headers, ...rows];
    const ws = XLSX.utils.aoa_to_sheet(wsData);

    ws['!cols'] = headers.map((h, i) => ({
      wch: i === 0 ? Math.max(h.length, 25) : 10,
    }));

    const unit = def.unit ?? '';
    const sheetName = sanitizeSheetName(unit ? `${def.name} (${unit})` : def.name);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  }

  if (!wb.SheetNames.length) {
    alert('Aucune donnée à exporter.');
    return;
  }

  XLSX.writeFile(wb, `KPI_CrossClient_${months}mois.xlsx`);
}

function sanitizeSheetName(name: string): string {
  // Excel sheet name: max 31 chars, no: \ / ? * [ ]
  return name.replace(/[\\/?*[\]]/g, '_').slice(0, 31);
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_');
}
