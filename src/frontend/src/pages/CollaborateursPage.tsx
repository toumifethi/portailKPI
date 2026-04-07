import React, { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { clientsApi, dashboardApi } from '@/api/endpoints';
import { getRagStatus } from '@/types';
import type { RagStatus } from '@/types';
import { SourceIssuesModal } from '@/components/shared/SourceIssuesModal';

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

function getPeriodDefault(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export default function CollaborateursPage() {
  const [searchParams] = useSearchParams();
  const [clientId, setClientId] = useState<number | ''>(() => {
    const raw = Number(searchParams.get('clientId'));
    return Number.isFinite(raw) && raw > 0 ? raw : '';
  });
  const [period, setPeriod] = useState(() => {
    const raw = searchParams.get('period');
    return raw && /^\d{4}-\d{2}$/.test(raw) ? raw : getPeriodDefault();
  });
  const [issueModal, setIssueModal] = useState<{ collaboratorId: number; collaboratorName: string; kpiName: string } | null>(null);
  const [kpiSearch, setKpiSearch] = useState('');
  const [visibleKpiNames, setVisibleKpiNames] = useState<string[]>([]);
  const [sortConfig, setSortConfig] = useState<{ by: 'name' | 'kpi'; kpiName?: string; direction: 'asc' | 'desc' }>({ by: 'name', direction: 'asc' });

  const { data: clients } = useQuery({
    queryKey: ['clients'],
    queryFn: clientsApi.list,
  });

  // KPIs formels (stockés en base)
  const { data: kpisData, isLoading: kpisLoading, isError: kpisError } = useQuery({
    queryKey: ['kpis-by-user', clientId, period],
    queryFn: () => dashboardApi.getKpisByUser(clientId as number, period),
    enabled: !!clientId && /^\d{4}-\d{2}$/.test(period),
  });

  // Extraire la liste des noms de KPI pour les colonnes dynamiques
  const kpiNames = useMemo(() => (
    kpisData && kpisData.length > 0
      ? [...new Set(kpisData.flatMap((r) => r.kpis.map((k) => k.kpiName)))]
      : []
  ), [kpisData]);

  useEffect(() => {
    if (kpiNames.length === 0) {
      setVisibleKpiNames([]);
      return;
    }

    setVisibleKpiNames((prev) => {
      const kept = prev.filter((name) => kpiNames.includes(name));
      return kept.length > 0 ? kept : kpiNames.slice(0, 6);
    });
  }, [kpiNames]);

  const selectableKpiNames = useMemo(() => {
    const normalizedSearch = kpiSearch.trim().toLowerCase();
    if (!normalizedSearch) {
      return kpiNames;
    }

    return kpiNames.filter((name) => name.toLowerCase().includes(normalizedSearch));
  }, [kpiNames, kpiSearch]);

  const displayedKpiNames = useMemo(
    () => visibleKpiNames.filter((name) => kpiNames.includes(name)),
    [visibleKpiNames, kpiNames],
  );

  const sortedRows = useMemo(() => {
    if (!kpisData) {
      return [];
    }

    const rows = [...kpisData];

    function getKpiValue(row: (typeof rows)[number], kpiName: string): number {
      const value = row.kpis.find((k) => k.kpiName === kpiName)?.value;
      return value ?? Number.NEGATIVE_INFINITY;
    }

    rows.sort((a, b) => {
      if (sortConfig.by === 'name') {
        const cmp = a.displayName.localeCompare(b.displayName, 'fr');
        return sortConfig.direction === 'asc' ? cmp : -cmp;
      }

      const kpiName = sortConfig.kpiName;
      if (!kpiName) {
        return 0;
      }

      const aVal = getKpiValue(a, kpiName);
      const bVal = getKpiValue(b, kpiName);
      return sortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal;
    });

    return rows;
  }, [kpisData, sortConfig]);

  function toggleVisibleKpi(kpiName: string) {
    setVisibleKpiNames((prev) => (
      prev.includes(kpiName)
        ? prev.filter((name) => name !== kpiName)
        : [...prev, kpiName]
    ));
  }

  function toggleKpiSort(kpiName: string) {
    setSortConfig((prev) => {
      if (prev.by === 'kpi' && prev.kpiName === kpiName) {
        return { by: 'kpi', kpiName, direction: prev.direction === 'desc' ? 'asc' : 'desc' };
      }
      return { by: 'kpi', kpiName, direction: 'desc' };
    });
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111827', margin: 0 }}>
          KPI par collaborateur
        </h1>
      </div>

      {/* Filtres */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div>
          <label style={labelStyle}>Client *</label>
          <select
            value={clientId}
            onChange={(e) => setClientId(e.target.value ? Number(e.target.value) : '')}
            style={inputStyle}
          >
            <option value="">— Sélectionner —</option>
            {(clients ?? []).map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Période</label>
          <input
            type="month"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            style={inputStyle}
          />
        </div>
      </div>

      {!clientId && (
        <div style={{ padding: 40, textAlign: 'center', color: '#6b7280', fontSize: 14 }}>
          Sélectionnez un client pour afficher les KPI collaborateurs.
        </div>
      )}
      {/* KPIs formels */}
      {clientId && (
        <>
          {kpisLoading && <div style={{ padding: 40, color: '#6b7280' }}>Chargement…</div>}
          {kpisError && (
            <div style={{ padding: 40, color: '#b91c1c' }}>
              Erreur de chargement. Les KPIs sont calculés après chaque import — lancez un import si nécessaire.
            </div>
          )}
          {kpisData && kpisData.length === 0 && (
            <div style={{ padding: 40, textAlign: 'center', color: '#6b7280', fontSize: 14 }}>
              Aucun résultat KPI pour cette période. Les KPIs par collaborateur sont calculés automatiquement après chaque import.
            </div>
          )}
          {kpisData && kpisData.length > 0 && (
            <div style={{ background: 'white', borderRadius: 8, border: '1px solid #e5e7eb', overflow: 'auto' }}>
              <div style={{ padding: 12, borderBottom: '1px solid #e5e7eb', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <input
                  value={kpiSearch}
                  onChange={(e) => setKpiSearch(e.target.value)}
                  placeholder="Rechercher un KPI..."
                  style={{ ...inputStyle, minWidth: 240 }}
                />
                <button
                  onClick={() => setVisibleKpiNames(kpiNames.slice(0, 6))}
                  style={smallActionBtnStyle}
                >
                  Top 6 KPI
                </button>
                <button
                  onClick={() => setVisibleKpiNames(kpiNames)}
                  style={smallActionBtnStyle}
                >
                  Tous les KPI
                </button>
                <span style={{ fontSize: 12, color: '#6b7280' }}>
                  {displayedKpiNames.length} KPI visible(s)
                </span>
              </div>

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

              <div style={{ overflow: 'auto', maxHeight: '64vh' }}>
                <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: 13, minWidth: 420 + (displayedKpiNames.length * 170) }}>
                <thead>
                  <tr style={{ background: '#f9fafb' }}>
                    <th style={{ ...thStyle, position: 'sticky', left: 0, top: 0, zIndex: 3, background: '#f9fafb', borderBottom: '1px solid #e5e7eb', minWidth: 220 }}>
                      <button
                        onClick={() => setSortConfig((prev) => ({ by: 'name', direction: prev.direction === 'asc' ? 'desc' : 'asc' }))}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#374151', fontWeight: 700, fontSize: 12, padding: 0 }}
                        title="Trier par collaborateur"
                      >
                        Collaborateur
                        {sortConfig.by === 'name' ? (sortConfig.direction === 'desc' ? ' ↓' : ' ↑') : ''}
                      </button>
                    </th>
                    {displayedKpiNames.map((name) => (
                      <th key={name} style={{ ...thStyle, textAlign: 'right', position: 'sticky', top: 0, zIndex: 2, background: '#f9fafb', borderBottom: '1px solid #e5e7eb', minWidth: 170 }}>
                        <button
                          onClick={() => toggleKpiSort(name)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#374151', fontWeight: 600, fontSize: 12 }}
                          title="Trier par ce KPI"
                        >
                          {name}
                          {sortConfig.by === 'kpi' && sortConfig.kpiName === name ? (sortConfig.direction === 'desc' ? ' ↓' : ' ↑') : ''}
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedRows.map((row, rowIndex) => (
                    <tr key={row.collaboratorId} style={{ background: rowIndex % 2 === 0 ? '#ffffff' : '#fcfcfd' }}>
                      <td style={{ ...tdStyle, fontWeight: 600, position: 'sticky', left: 0, background: rowIndex % 2 === 0 ? '#ffffff' : '#fcfcfd', borderBottom: '1px solid #f3f4f6', boxShadow: '1px 0 0 #f3f4f6' }}>
                        {row.displayName}
                      </td>
                      {displayedKpiNames.map((name) => {
                        const kpi = row.kpis.find((k) => k.kpiName === name);
                        const rag: RagStatus = getRagStatus(kpi?.value ?? null, {
                          thresholdRedMin: kpi?.thresholdRedMin ?? null,
                          thresholdRedMax: kpi?.thresholdRedMax ?? null,
                          thresholdOrangeMin: kpi?.thresholdOrangeMin ?? null,
                          thresholdOrangeMax: kpi?.thresholdOrangeMax ?? null,
                          thresholdGreenMin: kpi?.thresholdGreenMin ?? null,
                          thresholdGreenMax: kpi?.thresholdGreenMax ?? null,
                        });
                        const hasTickets = kpi && kpi.ticketCount > 0;
                        const displayValue = kpi?.value !== null && kpi?.value !== undefined
                          ? `${Math.abs(kpi.value) >= 100 ? Math.round(kpi.value) : Math.round(kpi.value * 10) / 10}${kpi.unit === '%' ? ' %' : kpi.unit ? ` ${kpi.unit}` : ''}`
                          : '—';
                        return (
                          <td
                            key={name}
                            style={{
                              ...tdStyle,
                              textAlign: 'center',
                              borderBottom: '1px solid #f3f4f6',
                              background: RAG_BG[rag],
                              borderLeft: `3px solid ${RAG_BORDER[rag]}`,
                              cursor: hasTickets ? 'pointer' : 'default',
                            }}
                            onClick={hasTickets ? () => setIssueModal({
                              collaboratorId: row.collaboratorId,
                              collaboratorName: row.displayName,
                              kpiName: name,
                            }) : undefined}
                            title={hasTickets ? `${kpi.ticketCount} ticket${kpi.ticketCount > 1 ? 's' : ''} — cliquer pour le détail` : undefined}
                          >
                            <div style={{ fontSize: 16, fontWeight: 700, color: '#111827' }}>
                              {displayValue}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>
          )}
        </>
      )}

      {kpisData && kpisData.length > 0 && (
        <div style={{ marginTop: 12, fontSize: 11, color: '#9ca3af' }}>
          Les KPIs formels sont calculés automatiquement après chaque import. Pour forcer un recalcul, relancez un import depuis la page Imports.
        </div>
      )}
      {/* Modal tickets source */}
      {issueModal && clientId && (
        <SourceIssuesModal
          clientId={clientId as number}
          collaboratorId={issueModal.collaboratorId}
          collaboratorName={issueModal.collaboratorName}
          kpiName={issueModal.kpiName}
          period={period}
          onClose={() => setIssueModal(null)}
        />
      )}
    </div>
  );
}

const labelStyle: React.CSSProperties = { display: 'block', fontSize: 12, color: '#6b7280', marginBottom: 4 };
const inputStyle: React.CSSProperties = { padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13, minWidth: 180 };
const thStyle: React.CSSProperties = { padding: '10px 16px', textAlign: 'left', fontSize: 12, color: '#6b7280', fontWeight: 600, whiteSpace: 'nowrap' };
const tdStyle: React.CSSProperties = { padding: '10px 16px' };
const smallActionBtnStyle: React.CSSProperties = { padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db', background: '#fff', fontSize: 12, cursor: 'pointer', color: '#374151' };
