import React, { useState } from 'react';
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
import { dashboardApi, kpiApi } from '@/api/endpoints';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

const CLIENT_COLORS = [
  '#4f94ef', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899',
];

export default function CrossClientPage() {
  const [selectedKpiId, setSelectedKpiId] = useState<number | null>(null);
  const [hiddenClients, setHiddenClients] = useState<Set<number>>(new Set());

  const { data: definitions } = useQuery({
    queryKey: ['kpi-definitions'],
    queryFn: kpiApi.getDefinitions,
  });

  const { data: crossData, isLoading } = useQuery({
    queryKey: ['cross-client', selectedKpiId],
    queryFn: () => dashboardApi.getCrossClient(selectedKpiId!),
    enabled: !!selectedKpiId,
  });

  const visibleClients = crossData?.clients.filter((c) => !hiddenClients.has(c.clientId)) ?? [];

  const chartData = crossData
    ? {
        labels: crossData.periods,
        datasets: visibleClients.map((client, i) => ({
          label: client.clientName,
          data: client.series.map((s) => s.value),
          borderColor: CLIENT_COLORS[i % CLIENT_COLORS.length],
          backgroundColor: CLIENT_COLORS[i % CLIENT_COLORS.length] + '20',
          tension: 0.3,
          spanGaps: true,
        })),
      }
    : null;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111827', margin: 0 }}>
          Vue cross-client
        </h1>
        <select
          value={selectedKpiId ?? ''}
          onChange={(e) => setSelectedKpiId(e.target.value ? Number(e.target.value) : null)}
          style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 14 }}
        >
          <option value="">— Sélectionner un KPI —</option>
          {definitions?.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
      </div>

      {/* Toggles clients */}
      {crossData && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          {crossData.clients.map((client, i) => (
            <button
              key={client.clientId}
              onClick={() => {
                setHiddenClients((prev) => {
                  const next = new Set(prev);
                  if (next.has(client.clientId)) next.delete(client.clientId);
                  else next.add(client.clientId);
                  return next;
                });
              }}
              style={{
                padding: '4px 12px',
                borderRadius: 999,
                border: `2px solid ${CLIENT_COLORS[i % CLIENT_COLORS.length]}`,
                background: hiddenClients.has(client.clientId)
                  ? 'white'
                  : CLIENT_COLORS[i % CLIENT_COLORS.length],
                color: hiddenClients.has(client.clientId)
                  ? CLIENT_COLORS[i % CLIENT_COLORS.length]
                  : 'white',
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 500,
              }}
            >
              {client.clientName}
            </button>
          ))}
        </div>
      )}

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
