import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Line } from 'react-chartjs-2';
import { exportClientKpisToExcel } from '@/utils/excelExport';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { useAppStore } from '@/store/appStore';
import type { CurrentUser } from '@/store/appStore';
import { dashboardApi, kpiApi } from '@/api/endpoints';
import { KpiCard } from '@/components/shared/KpiCard';
import { ExportButton } from '@/components/shared/ExportButton';
import { SourceIssuesModal } from '@/components/shared/SourceIssuesModal';
import { getRagStatus } from '@/types';
import type { DashboardKpi, RagStatus, KpiByUserRow, KpiClientConfig } from '@/types';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

// ---------------------------------------------------------------------------
// Constants & Helpers
// ---------------------------------------------------------------------------

const RAG_BG: Record<RagStatus, string> = {
  GREEN: '#d1fae5',
  ORANGE: '#fef3c7',
  RED: '#fee2e2',
  NEUTRAL: '#f9fafb',
};

const RAG_BORDER: Record<RagStatus, string> = {
  GREEN: '#10b981',
  ORANGE: '#f59e0b',
  RED: '#ef4444',
  NEUTRAL: '#9ca3af',
};

const CHART_COLORS = [
  '#4f46e5', '#db2777', '#059669', '#ea580c', '#7c3aed',
  '#0891b2', '#be123c', '#4338ca', '#d97706', '#0d9488',
  '#7c2d12', '#6d28d9', '#065f46', '#9333ea', '#b91c1c',
];

function getAvatarColor(name: string): string {
  const colors = ['#4f46e5', '#7c3aed', '#db2777', '#ea580c', '#059669', '#0891b2', '#4338ca', '#be123c'];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return (name.slice(0, 2)).toUpperCase();
}

function getProfileLevel(user: CurrentUser | null): number {
  return user?.profile?.level ?? 0;
}

function getProfileCode(user: CurrentUser | null): string {
  return user?.profile?.code ?? 'VIEWER';
}

function getProfileLabel(user: CurrentUser | null): string {
  return user?.profile?.label ?? 'Viewer';
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '---';
  const d = new Date(dateStr);
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ---------------------------------------------------------------------------
// Shared sub-components
// ---------------------------------------------------------------------------

function AvatarCircle({ name, size = 32 }: { name: string; size?: number }) {
  const bg = getAvatarColor(name);
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        backgroundColor: bg,
        color: '#fff',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size * 0.38,
        fontWeight: 600,
        flexShrink: 0,
        letterSpacing: 0.5,
      }}
    >
      {getInitials(name)}
    </div>
  );
}

function Section({ title, children, extra }: { title: string; children: React.ReactNode; extra?: React.ReactNode }) {
  return (
    <div style={{ marginTop: 32 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: '#111827', margin: 0 }}>{title}</h2>
        {extra}
      </div>
      {children}
    </div>
  );
}

function KpiTabSelector({
  configs,
  selectedId,
  onSelect,
}: {
  configs: KpiClientConfig[];
  selectedId: number | null;
  onSelect: (id: number) => void;
}) {
  return (
    <div style={{ display: 'flex', gap: 4, marginBottom: 16, flexWrap: 'wrap' }}>
      {configs.map((c) => {
        const active = c.id === selectedId;
        return (
          <button
            key={c.id}
            onClick={() => onSelect(c.id)}
            style={{
              padding: '6px 16px',
              borderRadius: 20,
              border: active ? '2px solid #4f46e5' : '1px solid #d1d5db',
              background: active ? '#eef2ff' : '#fff',
              color: active ? '#4f46e5' : '#374151',
              fontWeight: active ? 600 : 400,
              fontSize: 13,
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            {c.kpiDefinition?.name ?? `Config #${c.id}`}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 1. Header
// ---------------------------------------------------------------------------

function DashboardHeader({
  clientName,
  clientId,
  currentUser,
}: {
  clientName: string;
  clientId: number;
  currentUser: CurrentUser | null;
}) {
  const { data: lastUpdateData } = useQuery({
    queryKey: ['dashboard-last-update', clientId],
    queryFn: () => dashboardApi.getLastUpdate(clientId),
    enabled: !!clientId,
    refetchInterval: 60_000,
  });

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 28,
        flexWrap: 'wrap',
        gap: 12,
      }}
    >
      {/* Left: title + breadcrumb */}
      <div>
        <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 4 }}>
          Dashboard &rsaquo; <span style={{ color: '#6b7280' }}>{clientName}</span>
        </div>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#111827', margin: 0 }}>
          Tableau de bord
        </h1>
      </div>

      {/* Right: last update + user info */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        {/* Last update badge */}
        {lastUpdateData && (
          <div
            style={{
              background: '#f0fdf4',
              border: '1px solid #bbf7d0',
              borderRadius: 8,
              padding: '8px 14px',
              fontSize: 12,
              color: '#166534',
              lineHeight: 1.5,
            }}
          >
            <div style={{ fontWeight: 600 }}>Derniere mise a jour</div>
            <div>{formatDate(lastUpdateData.lastUpdate)}</div>
            {(lastUpdateData.issuesFetched > 0 || lastUpdateData.worklogsFetched > 0) && (
              <div style={{ color: '#15803d', marginTop: 2 }}>
                {lastUpdateData.issuesFetched} tickets, {lastUpdateData.worklogsFetched} worklogs
              </div>
            )}
          </div>
        )}

        {/* User badge */}
        {currentUser && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <AvatarCircle name={`${currentUser.firstName} ${currentUser.lastName}`} size={36} />
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>
                {currentUser.firstName} {currentUser.lastName}
              </div>
              <span
                style={{
                  fontSize: 11,
                  background: '#eef2ff',
                  color: '#4f46e5',
                  padding: '2px 8px',
                  borderRadius: 10,
                  fontWeight: 500,
                }}
              >
                {getProfileLabel(currentUser)}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 2. KPI cards row
// ---------------------------------------------------------------------------

function KpiCardsRow({ kpis, clientId, period }: { kpis: DashboardKpi[]; clientId: number; period: string }) {
  const [issueModal, setIssueModal] = useState<{ kpiName: string } | null>(null);

  if (!kpis.length) {
    return (
      <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>
        Aucun resultat KPI pour cette periode.
      </div>
    );
  }
  return (
    <>
    <div
      style={{
        display: 'flex',
        gap: 16,
        overflowX: 'auto',
        paddingBottom: 4,
      }}
    >
      {kpis.map((kpi) => (
        <div key={kpi.kpiId} style={{ minWidth: 220, flex: '1 0 220px', maxWidth: 300 }}>
          <KpiCard
            kpi={kpi}
            onClick={kpi.ticketCount ? () => setIssueModal({ kpiName: kpi.kpiName }) : undefined}
          />
        </div>
      ))}
    </div>

    {issueModal && (
      <SourceIssuesModal
        clientId={clientId}
        kpiName={issueModal.kpiName}
        period={period}
        onClose={() => setIssueModal(null)}
      />
    )}
    </>
  );
}

// ---------------------------------------------------------------------------
// 3. Team table (current period)
// ---------------------------------------------------------------------------

function TeamTable({
  clientId,
  period,
}: {
  clientId: number;
  period: string;
}) {
  const [issueModal, setIssueModal] = useState<{ collaboratorId: number; collaboratorName: string; kpiName: string } | null>(null);
  const [kpiSearch, setKpiSearch] = useState('');
  const [visibleKpiNames, setVisibleKpiNames] = useState<string[]>([]);

  const { data: rows, isLoading } = useQuery<KpiByUserRow[]>({
    queryKey: ['dashboard-kpis-by-user', clientId, period],
    queryFn: () => dashboardApi.getKpisByUser(clientId, period),
    enabled: !!clientId && !!period,
  });

  const kpiNames = useMemo(
    () => rows ? Array.from(new Set(rows.flatMap((r) => r.kpis.map((k) => k.kpiName)))) : [],
    [rows],
  );

  // Init visible KPIs when data changes
  React.useEffect(() => {
    if (kpiNames.length === 0) { setVisibleKpiNames([]); return; }
    setVisibleKpiNames((prev) => {
      const kept = prev.filter((name) => kpiNames.includes(name));
      return kept.length > 0 ? kept : kpiNames.slice(0, 6);
    });
  }, [kpiNames]);

  const selectableKpiNames = useMemo(() => {
    const q = kpiSearch.trim().toLowerCase();
    return q ? kpiNames.filter((n) => n.toLowerCase().includes(q)) : kpiNames;
  }, [kpiNames, kpiSearch]);

  const displayedKpiNames = useMemo(
    () => visibleKpiNames.filter((n) => kpiNames.includes(n)),
    [visibleKpiNames, kpiNames],
  );

  if (isLoading) return <div style={{ padding: 20, color: '#6b7280' }}>Chargement de l'equipe...</div>;
  if (!rows?.length) {
    return <div style={{ color: '#9ca3af', padding: 16 }}>Aucune donnee collaborateur pour cette periode.</div>;
  }

  // Compute team averages
  const teamAverages: Record<string, { sum: number; count: number }> = {};
  rows.forEach((row) => {
    row.kpis.forEach((k) => {
      if (k.value !== null) {
        if (!teamAverages[k.kpiName]) teamAverages[k.kpiName] = { sum: 0, count: 0 };
        teamAverages[k.kpiName].sum += k.value;
        teamAverages[k.kpiName].count += 1;
      }
    });
  });

  function toggleVisibleKpi(name: string) {
    setVisibleKpiNames((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name],
    );
  }

  const thStyle: React.CSSProperties = {
    textAlign: 'center',
    padding: '10px 14px',
    borderBottom: '2px solid #e5e7eb',
    background: '#f9fafb',
    fontWeight: 600,
    color: '#374151',
    whiteSpace: 'nowrap',
    fontSize: 13,
  };

  const cellBase: React.CSSProperties = {
    textAlign: 'center',
    padding: '10px 14px',
    borderBottom: '1px solid #e5e7eb',
    fontWeight: 500,
    color: '#111827',
    fontSize: 13,
  };

  return (
    <>
    <div style={{ background: 'white', borderRadius: 8, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
      {/* KPI filter bar */}
      <div style={{ padding: 12, borderBottom: '1px solid #e5e7eb', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          value={kpiSearch}
          onChange={(e) => setKpiSearch(e.target.value)}
          placeholder="Rechercher un KPI..."
          style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13, minWidth: 200 }}
        />
        <button
          onClick={() => setVisibleKpiNames(kpiNames.slice(0, 6))}
          style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db', background: '#fff', fontSize: 12, cursor: 'pointer', color: '#374151' }}
        >
          Top 6 KPI
        </button>
        <button
          onClick={() => setVisibleKpiNames(kpiNames)}
          style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db', background: '#fff', fontSize: 12, cursor: 'pointer', color: '#374151' }}
        >
          Tous les KPI
        </button>
        <span style={{ fontSize: 12, color: '#6b7280' }}>
          {displayedKpiNames.length} KPI visible(s)
        </span>
      </div>

      {/* KPI chips */}
      <div style={{ padding: 12, borderBottom: '1px solid #e5e7eb', display: 'flex', gap: 6, flexWrap: 'wrap', maxHeight: 120, overflow: 'auto' }}>
        {selectableKpiNames.map((name) => {
          const selected = displayedKpiNames.includes(name);
          return (
            <button
              key={name}
              onClick={() => toggleVisibleKpi(name)}
              style={{
                border: selected ? '1px solid #60a5fa' : '1px solid #d1d5db',
                background: selected ? '#eff6ff' : '#ffffff',
                color: selected ? '#1d4ed8' : '#374151',
                borderRadius: 999,
                fontSize: 11,
                padding: '4px 10px',
                cursor: 'pointer',
              }}
            >
              {selected ? '✓ ' : ''}{name}
            </button>
          );
        })}
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto' }}>
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          background: 'white',
        }}
      >
        <thead>
          <tr>
            <th style={{ ...thStyle, textAlign: 'left', minWidth: 200 }}>Collaborateur</th>
            {displayedKpiNames.map((name) => (
              <th key={name} style={thStyle}>{name}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.collaboratorId} style={{ transition: 'background 0.1s' }}>
              <td
                style={{
                  padding: '10px 14px',
                  borderBottom: '1px solid #e5e7eb',
                  whiteSpace: 'nowrap',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <AvatarCircle name={row.displayName} />
                  <span style={{ fontWeight: 500, color: '#111827', fontSize: 13 }}>{row.displayName}</span>
                </div>
              </td>
              {displayedKpiNames.map((name) => {
                const kpi = row.kpis.find((k) => k.kpiName === name);
                const value = kpi?.value ?? null;
                const cellRag = kpi
                  ? getRagStatus(value, kpi as Parameters<typeof getRagStatus>[1])
                  : 'NEUTRAL';
                const hasTickets = kpi && kpi.ticketCount > 0;
                const displayVal = value !== null
                  ? `${Math.abs(value) >= 100 ? Math.round(value) : Math.round(value * 10) / 10}${kpi?.unit === '%' ? ' %' : kpi?.unit ? ` ${kpi.unit}` : ''}`
                  : '---';
                return (
                  <td
                    key={name}
                    style={{
                      ...cellBase,
                      background: RAG_BG[cellRag],
                      borderLeft: `3px solid ${RAG_BORDER[cellRag]}`,
                      cursor: hasTickets ? 'pointer' : 'default',
                    }}
                    onClick={hasTickets ? () => setIssueModal({
                      collaboratorId: row.collaboratorId,
                      collaboratorName: row.displayName,
                      kpiName: name,
                    }) : undefined}
                    title={hasTickets ? `${kpi.ticketCount} ticket${kpi.ticketCount > 1 ? 's' : ''} — cliquer pour le detail` : undefined}
                  >
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>
                      {displayVal}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}

          {/* Team average row */}
          <tr style={{ background: '#f3f4f6' }}>
            <td
              style={{
                padding: '10px 14px',
                borderBottom: '1px solid #e5e7eb',
                fontWeight: 700,
                color: '#111827',
                fontSize: 13,
              }}
            >
              MOYENNE EQUIPE
            </td>
            {displayedKpiNames.map((name) => {
              const avg = teamAverages[name];
              const value = avg ? avg.sum / avg.count : null;
              // Use first row's kpi thresholds as reference
              const refKpi = rows[0]?.kpis.find((k) => k.kpiName === name);
              const cellRag = refKpi && value !== null
                ? getRagStatus(value, refKpi as Parameters<typeof getRagStatus>[1])
                : 'NEUTRAL';
              const unit = refKpi?.unit ?? '';
              const displayVal = value !== null ? `${value.toFixed(1)}${unit}` : '---';
              return (
                <td
                  key={name}
                  style={{
                    ...cellBase,
                    fontWeight: 700,
                    background: RAG_BG[cellRag],
                  }}
                >
                  {displayVal}
                </td>
              );
            })}
          </tr>
        </tbody>
      </table>
    </div>
    </div>

    {/* Modal tickets source */}
    {issueModal && (
      <SourceIssuesModal
        clientId={clientId}
        collaboratorId={issueModal.collaboratorId}
        collaboratorName={issueModal.collaboratorName}
        kpiName={issueModal.kpiName}
        period={period}
        onClose={() => setIssueModal(null)}
      />
    )}
    </>
  );
}

// ---------------------------------------------------------------------------
// 4. Heatmap 6 months
// ---------------------------------------------------------------------------

interface HeatmapData {
  kpiName: string;
  unit: string | null;
  thresholds: {
    thresholdRedMin: number | null;
    thresholdRedMax: number | null;
    thresholdOrangeMin: number | null;
    thresholdOrangeMax: number | null;
    thresholdGreenMin: number | null;
    thresholdGreenMax: number | null;
  };
  periods: string[];
  collaborators: Array<{
    id: number;
    name: string;
    initials: string;
    values: Record<string, number | null>;
  }>;
  teamAverage: Record<string, number | null>;
}

function HeatmapSection({
  clientId,
  clientName,
  configs,
}: {
  clientId: number;
  clientName: string;
  configs: KpiClientConfig[];
}) {
  const [selectedConfigId, setSelectedConfigId] = useState<number | null>(
    configs.length > 0 ? configs[0].id : null,
  );
  const [monthsCount, setMonthsCount] = useState(6);
  const [issueModal, setIssueModal] = useState<{ collaboratorId: number; collaboratorName: string; kpiName: string; period: string } | null>(null);

  const { data: heatmap, isLoading } = useQuery<HeatmapData>({
    queryKey: ['dashboard-heatmap-history', clientId, selectedConfigId, monthsCount],
    queryFn: () => dashboardApi.getTeamHeatmapHistory(clientId, selectedConfigId!, monthsCount),
    enabled: !!clientId && !!selectedConfigId,
  });

  if (!configs.length) return null;

  const thresholds = heatmap?.thresholds ?? {
    thresholdRedMin: null, thresholdRedMax: null,
    thresholdOrangeMin: null, thresholdOrangeMax: null,
    thresholdGreenMin: null, thresholdGreenMax: null,
  };

  const thStyle: React.CSSProperties = {
    textAlign: 'center',
    padding: '8px 12px',
    borderBottom: '2px solid #e5e7eb',
    background: '#f9fafb',
    fontWeight: 600,
    color: '#374151',
    whiteSpace: 'nowrap',
    fontSize: 12,
  };

  const cellBase: React.CSSProperties = {
    textAlign: 'center',
    padding: '8px 12px',
    borderBottom: '1px solid #e5e7eb',
    fontWeight: 500,
    color: '#111827',
    fontSize: 13,
  };

  const MONTH_OPTIONS = [3, 6, 9, 12];

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <KpiTabSelector
          configs={configs}
          selectedId={selectedConfigId}
          onSelect={setSelectedConfigId}
        />
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          {MONTH_OPTIONS.map((m) => (
            <button
              key={m}
              onClick={() => setMonthsCount(m)}
              style={{
                padding: '4px 12px',
                borderRadius: 16,
                border: monthsCount === m ? '2px solid #4f46e5' : '1px solid #d1d5db',
                background: monthsCount === m ? '#eef2ff' : '#fff',
                color: monthsCount === m ? '#4f46e5' : '#6b7280',
                fontWeight: monthsCount === m ? 700 : 400,
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              {m} mois
            </button>
          ))}
        </div>
        <button
          onClick={() => exportClientKpisToExcel(clientId, clientName, 12)}
          style={{
            padding: '5px 14px',
            borderRadius: 6,
            border: '1px solid #d1d5db',
            background: '#fff',
            color: '#374151',
            fontSize: 12,
            cursor: 'pointer',
            fontWeight: 500,
            marginLeft: 'auto',
          }}
        >
          Exporter Excel
        </button>
      </div>

      {isLoading && <div style={{ padding: 16, color: '#6b7280' }}>Chargement...</div>}

      {heatmap && (
        <>
          <div style={{ overflowX: 'auto' }}>
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                background: 'white',
                border: '1px solid #e5e7eb',
                borderRadius: 8,
              }}
            >
              <thead>
                <tr>
                  <th style={{ ...thStyle, textAlign: 'left', minWidth: 180 }}>Collaborateur</th>
                  {heatmap.periods.map((p) => (
                    <th key={p} style={thStyle}>{p}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {heatmap.collaborators.map((collab) => (
                  <tr key={collab.id}>
                    <td
                      style={{
                        padding: '8px 12px',
                        borderBottom: '1px solid #e5e7eb',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <AvatarCircle name={collab.name} size={28} />
                        <span style={{ fontWeight: 500, color: '#111827', fontSize: 13 }}>
                          {collab.name}
                        </span>
                      </div>
                    </td>
                    {heatmap.periods.map((period) => {
                      const val = collab.values[period] ?? null;
                      const rag = getRagStatus(val, thresholds);
                      const unit = heatmap.unit ?? '';
                      return (
                        <td
                          key={period}
                          style={{
                            ...cellBase,
                            background: RAG_BG[rag],
                            borderLeft: `3px solid ${RAG_BORDER[rag]}`,
                            cursor: val !== null ? 'pointer' : 'default',
                          }}
                          onClick={val !== null ? () => setIssueModal({
                            collaboratorId: collab.id,
                            collaboratorName: collab.name,
                            kpiName: heatmap.kpiName,
                            period,
                          }) : undefined}
                          title={val !== null ? 'Cliquer pour le detail des tickets' : undefined}
                        >
                          {val !== null ? `${val.toFixed(1)}${unit}` : '---'}
                        </td>
                      );
                    })}
                  </tr>
                ))}

                {/* Team average row */}
                <tr style={{ background: '#f3f4f6' }}>
                  <td
                    style={{
                      padding: '8px 12px',
                      borderBottom: '1px solid #e5e7eb',
                      fontWeight: 700,
                      color: '#111827',
                      fontSize: 13,
                    }}
                  >
                    MOYENNE EQUIPE
                  </td>
                  {heatmap.periods.map((period) => {
                    const val = heatmap.teamAverage[period] ?? null;
                    const rag = getRagStatus(val, thresholds);
                    const unit = heatmap.unit ?? '';
                    return (
                      <td key={period} style={{ ...cellBase, fontWeight: 700, background: RAG_BG[rag], borderLeft: `3px solid ${RAG_BORDER[rag]}` }}>
                        {val !== null ? `${val.toFixed(1)}${unit}` : '---'}
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>

          {/* RAG Legend */}
          <div style={{ display: 'flex', gap: 16, marginTop: 12, fontSize: 12, color: '#6b7280' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 14, height: 14, borderRadius: 3, background: RAG_BG.GREEN, border: '1px solid #bbf7d0', display: 'inline-block' }} />
              Vert
              {thresholds.thresholdGreenMin != null || thresholds.thresholdGreenMax != null
                ? ` (${thresholds.thresholdGreenMin ?? '...'} - ${thresholds.thresholdGreenMax ?? '...'})`
                : ''}
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 14, height: 14, borderRadius: 3, background: RAG_BG.ORANGE, border: '1px solid #fde68a', display: 'inline-block' }} />
              Orange
              {thresholds.thresholdOrangeMin != null || thresholds.thresholdOrangeMax != null
                ? ` (${thresholds.thresholdOrangeMin ?? '...'} - ${thresholds.thresholdOrangeMax ?? '...'})`
                : ''}
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 14, height: 14, borderRadius: 3, background: RAG_BG.RED, border: '1px solid #fecaca', display: 'inline-block' }} />
              Rouge
              {thresholds.thresholdRedMin != null || thresholds.thresholdRedMax != null
                ? ` (${thresholds.thresholdRedMin ?? '...'} - ${thresholds.thresholdRedMax ?? '...'})`
                : ''}
            </span>
          </div>
        </>
      )}

      {/* Modal tickets source */}
      {issueModal && (
        <SourceIssuesModal
          clientId={clientId}
          collaboratorId={issueModal.collaboratorId}
          collaboratorName={issueModal.collaboratorName}
          kpiName={issueModal.kpiName}
          period={issueModal.period}
          onClose={() => setIssueModal(null)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 5. Evolution multi-curves
// ---------------------------------------------------------------------------

function EvolutionMultiCurves({
  clientId,
  configs,
}: {
  clientId: number;
  configs: KpiClientConfig[];
}) {
  const [selectedConfigId, setSelectedConfigId] = useState<number | null>(
    configs.length > 0 ? configs[0].id : null,
  );

  // Get team members from kpis-by-user to know collaborator IDs
  const selectedPeriod = useAppStore((s) => s.selectedPeriod);
  const { data: teamRows } = useQuery<KpiByUserRow[]>({
    queryKey: ['dashboard-kpis-by-user', clientId, selectedPeriod],
    queryFn: () => dashboardApi.getKpisByUser(clientId, selectedPeriod),
    enabled: !!clientId && !!selectedPeriod,
  });

  // Fetch evolution for each collaborator
  const collaborators = teamRows ?? [];
  const evolutionQueries = useQuery({
    queryKey: ['dashboard-evolution-multi', clientId, selectedConfigId, collaborators.map((c) => c.collaboratorId)],
    queryFn: async () => {
      if (!selectedConfigId || !collaborators.length) return null;
      const results = await Promise.all(
        collaborators.map(async (collab) => {
          try {
            const data = await dashboardApi.getEvolutionByUser(collab.collaboratorId, selectedConfigId, 6);
            return { collaboratorId: collab.collaboratorId, name: collab.displayName, data };
          } catch {
            return { collaboratorId: collab.collaboratorId, name: collab.displayName, data: [] };
          }
        }),
      );
      return results;
    },
    enabled: !!clientId && !!selectedConfigId && collaborators.length > 0,
  });

  const chartData = useMemo(() => {
    if (!evolutionQueries.data) return null;
    const allResults = evolutionQueries.data;
    if (!allResults.length) return null;

    // Use the first non-empty result's periods as labels
    const firstWithData = allResults.find((r) => r.data.length > 0);
    if (!firstWithData) return null;
    const labels = firstWithData.data.map((p: { period: string }) => p.period);

    const datasets = allResults.map((result, idx) => ({
      label: result.name,
      data: result.data.map((p: { value: number | null }) => p.value),
      borderColor: CHART_COLORS[idx % CHART_COLORS.length],
      backgroundColor: CHART_COLORS[idx % CHART_COLORS.length] + '20',
      tension: 0.3,
      spanGaps: true,
      pointRadius: 4,
      pointHoverRadius: 6,
      borderWidth: 2,
    }));

    return { labels, datasets };
  }, [evolutionQueries.data]);

  if (!configs.length) return null;

  return (
    <div>
      <KpiTabSelector
        configs={configs}
        selectedId={selectedConfigId}
        onSelect={setSelectedConfigId}
      />

      {evolutionQueries.isLoading && <div style={{ padding: 16, color: '#6b7280' }}>Chargement...</div>}

      {chartData && (
        <div
          style={{
            background: 'white',
            borderRadius: 8,
            padding: 24,
            border: '1px solid #e5e7eb',
          }}
        >
          <Line
            data={chartData}
            options={{
              responsive: true,
              interaction: { mode: 'index', intersect: false },
              plugins: {
                legend: {
                  position: 'bottom',
                  labels: { usePointStyle: true, padding: 16, font: { size: 12 } },
                },
                tooltip: { mode: 'index', intersect: false },
              },
              scales: {
                y: { beginAtZero: false, grid: { color: '#f3f4f6' } },
                x: { grid: { display: false } },
              },
            }}
          />
        </div>
      )}

      {!evolutionQueries.isLoading && !chartData && selectedConfigId && (
        <div style={{ color: '#9ca3af', padding: 16 }}>Aucune donnee d'evolution disponible.</div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// DEV/VIEWER: Personal sections
// ---------------------------------------------------------------------------

function MyKpisSection({ period }: { period: string }) {
  const { data: myKpis, isLoading } = useQuery({
    queryKey: ['dashboard-my-kpis', period],
    queryFn: () => dashboardApi.getMyKpis(period),
    enabled: !!period,
  });

  if (isLoading) return <div style={{ color: '#6b7280' }}>Chargement de vos KPIs...</div>;
  if (!myKpis?.length) {
    return <div style={{ color: '#9ca3af' }}>Aucun KPI personnel pour cette periode.</div>;
  }

  return (
    <div>
      {myKpis.map((group) => (
        <div key={group.clientId} style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: '#374151', marginBottom: 12 }}>
            {group.clientName}
          </h3>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
              gap: 12,
            }}
          >
            {group.kpis.map((kpi) => (
              <KpiCard key={kpi.kpiName} kpi={kpi} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function MyEvolutionSection({ userId }: { userId: number }) {
  const { selectedClientId } = useAppStore();
  const [selectedConfigId, setSelectedConfigId] = useState<number | null>(null);

  const { data: configs } = useQuery({
    queryKey: ['kpi-configs', selectedClientId],
    queryFn: () => kpiApi.getConfigs(selectedClientId!),
    enabled: !!selectedClientId,
  });

  const { data: evolution, isLoading } = useQuery({
    queryKey: ['kpi-evolution-by-user', userId, selectedConfigId],
    queryFn: () => dashboardApi.getEvolutionByUser(userId, selectedConfigId!, 6),
    enabled: !!userId && !!selectedConfigId,
  });

  const chartData = evolution
    ? {
        labels: evolution.map((p: { period: string }) => p.period),
        datasets: [
          {
            label: configs?.find((c) => c.id === selectedConfigId)?.kpiDefinition?.name ?? 'KPI',
            data: evolution.map((p: { value: number | null }) => p.value),
            borderColor: '#8b5cf6',
            backgroundColor: 'rgba(139,92,246,0.1)',
            tension: 0.3,
            spanGaps: true,
            pointRadius: 4,
            borderWidth: 2,
          },
        ],
      }
    : null;

  return (
    <div>
      <select
        value={selectedConfigId ?? ''}
        onChange={(e) => setSelectedConfigId(e.target.value ? Number(e.target.value) : null)}
        style={{
          padding: '6px 12px',
          borderRadius: 6,
          border: '1px solid #d1d5db',
          fontSize: 14,
          marginBottom: 16,
        }}
      >
        <option value="">-- Selectionner un KPI --</option>
        {configs?.map((c) => (
          <option key={c.id} value={c.id}>
            {c.kpiDefinition?.name ?? `Config #${c.id}`}
          </option>
        ))}
      </select>

      {isLoading && <div style={{ color: '#6b7280' }}>Chargement...</div>}

      {chartData && (
        <div
          style={{
            background: 'white',
            borderRadius: 8,
            padding: 24,
            border: '1px solid #e5e7eb',
          }}
        >
          <Line
            data={chartData}
            options={{
              responsive: true,
              plugins: {
                legend: { position: 'top', labels: { usePointStyle: true } },
              },
              scales: {
                y: { beginAtZero: false, grid: { color: '#f3f4f6' } },
                x: { grid: { display: false } },
              },
            }}
          />
        </div>
      )}

      {!selectedClientId && (
        <div style={{ color: '#9ca3af', marginTop: 8 }}>
          Selectionnez un client pour voir les KPIs disponibles.
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function DashboardPage() {
  const currentUser = useAppStore((s) => s.currentUser);
  const selectedClientId = useAppStore((s) => s.selectedClientId);
  const selectedPeriod = useAppStore((s) => s.selectedPeriod);
  const clients = useAppStore((s) => s.clients);

  const profileLevel = getProfileLevel(currentUser);
  const profileCode = getProfileCode(currentUser);

  const isAdminOrDM = profileLevel >= 80;
  const isChefDeProjet = profileCode === 'CHEF_DE_PROJET';
  const isDeveloppeurOrViewer = profileLevel <= 40;

  const clientName = clients.find((c) => c.id === selectedClientId)?.name ?? '';

  // KPI configs for the selected client
  const { data: kpiConfigs } = useQuery<KpiClientConfig[]>({
    queryKey: ['kpi-configs', selectedClientId],
    queryFn: () => kpiApi.getConfigs(selectedClientId!),
    enabled: !!selectedClientId && !isDeveloppeurOrViewer,
  });

  // Dashboard KPIs for selected client
  const {
    data: kpis,
    isLoading: kpisLoading,
    error: kpisError,
  } = useQuery<DashboardKpi[]>({
    queryKey: ['dashboard-kpis', selectedClientId, selectedPeriod],
    queryFn: () => dashboardApi.getKpis(selectedClientId!, selectedPeriod),
    enabled: !!selectedClientId && !!selectedPeriod && !isDeveloppeurOrViewer,
  });

  const activeConfigs = useMemo(
    () => (kpiConfigs ?? []).filter((c) => c.isActive),
    [kpiConfigs],
  );

  // -----------------------------------------------------------------------
  // DEVELOPPEUR / VIEWER view
  // -----------------------------------------------------------------------
  if (isDeveloppeurOrViewer) {
    return (
      <div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 24,
          }}
        >
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: '#111827', margin: 0 }}>
              Mon tableau de bord
            </h1>
            {currentUser && (
              <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>
                {currentUser.firstName} {currentUser.lastName}
                <span
                  style={{
                    fontSize: 11,
                    background: '#eef2ff',
                    color: '#4f46e5',
                    padding: '2px 8px',
                    borderRadius: 10,
                    fontWeight: 500,
                    marginLeft: 8,
                  }}
                >
                  {getProfileLabel(currentUser)}
                </span>
              </div>
            )}
          </div>
        </div>

        <Section title="Mes KPIs">
          <MyKpisSection period={selectedPeriod} />
        </Section>

        <Section title="Mon evolution">
          {currentUser ? (
            <MyEvolutionSection userId={currentUser.id} />
          ) : (
            <div style={{ color: '#9ca3af' }}>Utilisateur non identifie.</div>
          )}
        </Section>
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // ADMIN / DELIVERY_MANAGER / CHEF_DE_PROJET view
  // -----------------------------------------------------------------------
  if (!selectedClientId) {
    return (
      <div
        style={{
          textAlign: 'center',
          padding: 60,
          color: '#9ca3af',
        }}
      >
        <div style={{ fontSize: 48, marginBottom: 12 }}>&#128202;</div>
        <div style={{ fontSize: 16, fontWeight: 500 }}>Selectionnez un client pour afficher le tableau de bord.</div>
      </div>
    );
  }

  if (kpisLoading) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>
        <div style={{ fontSize: 16 }}>Chargement du tableau de bord...</div>
      </div>
    );
  }

  if (kpisError) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#ef4444' }}>
        Erreur lors du chargement du tableau de bord.
      </div>
    );
  }

  return (
    <div>
      {/* 1. Header */}
      <DashboardHeader
        clientName={clientName}
        clientId={selectedClientId}
        currentUser={currentUser}
      />

      {/* 2. KPI cards row */}
      <Section
        title="KPIs globaux"
        extra={<ExportButton data={kpis ?? []} filename={`kpi-${selectedPeriod}`} />}
      >
        <KpiCardsRow kpis={kpis ?? []} clientId={selectedClientId} period={selectedPeriod} />
      </Section>

      {/* 3. Team table */}
      {(isAdminOrDM || isChefDeProjet) && (
        <Section title={isChefDeProjet ? 'Mon equipe' : 'Equipe'}>
          <TeamTable clientId={selectedClientId} period={selectedPeriod} />
        </Section>
      )}

      {/* 4. Heatmap 6 months */}
      {(isAdminOrDM || isChefDeProjet) && activeConfigs.length > 0 && (
        <Section title="Heatmap equipe">
          <HeatmapSection clientId={selectedClientId} clientName={clientName} configs={activeConfigs} />
        </Section>
      )}

      {/* 5. Evolution multi-curves */}
      {activeConfigs.length > 0 && (
        <Section title="Evolution equipe">
          <EvolutionMultiCurves clientId={selectedClientId} configs={activeConfigs} />
        </Section>
      )}
    </div>
  );
}
