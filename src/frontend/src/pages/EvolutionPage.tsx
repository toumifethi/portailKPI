import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { useAppStore } from '@/store/appStore';
import { dashboardApi, kpiApi } from '@/api/endpoints';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

export default function EvolutionPage() {
  const { selectedClientId } = useAppStore();
  const [selectedConfigId, setSelectedConfigId] = useState<number | null>(null);

  const { data: configs } = useQuery({
    queryKey: ['kpi-configs', selectedClientId],
    queryFn: () => kpiApi.getConfigs(selectedClientId!),
    enabled: !!selectedClientId,
  });

  const { data: evolution, isLoading } = useQuery({
    queryKey: ['kpi-evolution', selectedClientId, selectedConfigId],
    queryFn: () => dashboardApi.getEvolution(selectedClientId!, selectedConfigId!),
    enabled: !!selectedClientId && !!selectedConfigId,
  });

  if (!selectedClientId) {
    return (
      <div style={{ textAlign: 'center', padding: 60, color: '#9ca3af' }}>
        Sélectionnez un client pour afficher l'évolution.
      </div>
    );
  }

  const chartData = evolution
    ? {
        labels: evolution.map((p) => p.period),
        datasets: [
          {
            label: configs?.find((c) => c.id === selectedConfigId)?.kpiDefinition?.name ?? 'KPI',
            data: evolution.map((p) => p.value),
            borderColor: '#4f94ef',
            backgroundColor: 'rgba(79,148,239,0.1)',
            tension: 0.3,
            spanGaps: true,
          },
        ],
      }
    : null;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111827', margin: 0 }}>
          Évolution KPI
        </h1>
        <select
          value={selectedConfigId ?? ''}
          onChange={(e) => setSelectedConfigId(e.target.value ? Number(e.target.value) : null)}
          style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 14 }}
        >
          <option value="">— Sélectionner un KPI —</option>
          {configs?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.kpiDefinition?.name ?? `Config #${c.id}`}
            </option>
          ))}
        </select>
      </div>

      {isLoading && <div>Chargement…</div>}

      {chartData && (
        <div style={{ background: 'white', borderRadius: 8, padding: 24, border: '1px solid #e5e7eb' }}>
          <Line
            data={chartData}
            options={{
              responsive: true,
              plugins: { legend: { position: 'top' } },
              scales: { y: { beginAtZero: false } },
            }}
          />
        </div>
      )}
    </div>
  );
}
