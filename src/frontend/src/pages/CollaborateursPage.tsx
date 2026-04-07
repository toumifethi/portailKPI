import React, { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { clientsApi, dashboardApi, kpiApi } from '@/api/endpoints';
import { getRagStatus } from '@/types';
import type { RagStatus, KpiSourceIssue } from '@/types';

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

// ── Modal détail des tickets source ──

function SourceIssuesModal({
  clientId,
  collaboratorId,
  collaboratorName,
  kpiName,
  period,
  onClose,
}: {
  clientId: number;
  collaboratorId: number;
  collaboratorName: string;
  kpiName: string;
  period: string;
  onClose: () => void;
}) {
  // Trouver le kpiClientConfigId pour ce KPI name + client
  const { data: configs } = useQuery({
    queryKey: ['kpi-configs', clientId],
    queryFn: () => import('@/api/endpoints').then((m) => m.kpiApi.getConfigs(clientId)),
  });

  const config = configs?.find((c) => c.kpiDefinition?.name === kpiName);

  const { data: issues, isLoading } = useQuery({
    queryKey: ['kpi-source-issues', config?.id, collaboratorId, period],
    queryFn: () => kpiApi.getSourceIssues(config!.id, period, collaboratorId),
    enabled: !!config,
  });

  const [worklogIssueId, setWorklogIssueId] = useState<number | null>(null);

  function fmtH(hours: number | null): string {
    if (hours === null || hours === 0) return '—';
    return `${Math.round(hours * 10) / 10}h`;
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300 }}
      onClick={onClose}
    >
      <div
        style={{ background: 'white', borderRadius: 10, padding: 24, width: 1100, maxWidth: '95vw', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
              Tickets source — {collaboratorName}
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: '#6b7280' }}>
              KPI : {kpiName} — Periode : {period} — {issues?.length ?? '...'} ticket(s)
              {issues && issues.length > 0 && (
                <span style={{ marginLeft: 12 }}>
                  Estime : <strong>{Math.round(issues.reduce((s, i) => s + (i.rollupEstimateHours ?? 0), 0) * 10) / 10}h</strong>
                  {' — '}
                  Consomme : <strong>{Math.round(issues.reduce((s, i) => s + (i.rollupTimeSpentHours ?? 0), 0) * 10) / 10}h</strong>
                  {' — '}
                  Restant : <strong>{Math.round(issues.reduce((s, i) => s + (i.rollupRemainingHours ?? 0), 0) * 10) / 10}h</strong>
                </span>
              )}
            </p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#6b7280' }}>{'×'}</button>
        </div>

        {isLoading && <div style={{ padding: 32, color: '#6b7280', textAlign: 'center' }}>Chargement...</div>}

        {issues && (
          <div style={{ overflow: 'auto', flex: 1 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb', position: 'sticky', top: 0 }}>
                  {['Cle', 'Resume', 'Type', 'Statut', 'Assigne', 'Estime (rollup)', 'Consomme (rollup)', 'Restant (rollup)'].map((h) => (
                    <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontSize: 11, color: '#6b7280', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {issues.map((issue) => (
                  <tr key={issue.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '6px 10px', fontFamily: 'monospace', color: '#4f94ef', fontSize: 11 }}>{issue.jiraKey}</td>
                    <td style={{ padding: '6px 10px', maxWidth: 300 }}>
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={issue.summary}>
                        {issue.summary}
                      </div>
                    </td>
                    <td style={{ padding: '6px 10px' }}>
                      <span style={{ padding: '1px 6px', borderRadius: 3, fontSize: 10, background: '#f3f4f6', color: '#374151' }}>{issue.issueType}</span>
                    </td>
                    <td style={{ padding: '6px 10px' }}>
                      <span style={{ padding: '1px 6px', borderRadius: 3, fontSize: 10, background: '#dbeafe', color: '#1d4ed8' }}>{issue.status}</span>
                    </td>
                    <td style={{ padding: '6px 10px', fontSize: 11 }}>{issue.assigneeDisplayName ?? '—'}</td>
                    <td style={{ padding: '6px 10px', textAlign: 'right' }}>{fmtH(issue.rollupEstimateHours)}</td>
                    <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 500 }}>
                      {issue.rollupTimeSpentHours ? (
                        <button
                          onClick={() => setWorklogIssueId(issue.id)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#4f46e5', textDecoration: 'underline', fontWeight: 500, fontSize: 12 }}
                        >
                          {fmtH(issue.rollupTimeSpentHours)}
                        </button>
                      ) : '—'}
                    </td>
                    <td style={{ padding: '6px 10px', textAlign: 'right', color: '#9333ea' }}>{fmtH(issue.rollupRemainingHours)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      {/* Modal worklogs */}
      {worklogIssueId && (
        <WorklogDetailModal issueId={worklogIssueId} period={period} onClose={() => setWorklogIssueId(null)} />
      )}
      </div>
    </div>
  );
}

// ── Modal worklogs détaillés ──

function WorklogDetailModal({ issueId, period, onClose }: { issueId: number; period?: string; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['issue-worklogs', issueId, period],
    queryFn: () => kpiApi.getIssueWorklogs(issueId, period),
  });

  const worklogs = data?.worklogs ?? [];
  const outsideWorklogs = (data as unknown as { outsideWorklogs?: typeof worklogs })?.outsideWorklogs ?? [];
  const totals = data?.totals;

  function fmtDuration(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return m > 0 ? `${h}h${m.toString().padStart(2, '0')}` : `${h}h`;
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 400 }}
      onClick={onClose}
    >
      <div
        style={{ background: 'white', borderRadius: 10, padding: 24, width: 800, maxWidth: '95vw', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Worklogs detailles</h3>
            {totals && (
              <div style={{ display: 'flex', gap: 16, marginTop: 4, fontSize: 12 }}>
                <span style={{ color: '#065f46', fontWeight: 600, background: '#d1fae5', padding: '2px 8px', borderRadius: 4 }}>
                  Periode ({period}) : {totals.periodHours}h ({totals.worklogCountPeriod} worklogs)
                </span>
                <span style={{ color: '#6b7280', background: '#f3f4f6', padding: '2px 8px', borderRadius: 4 }}>
                  Total historique : {totals.allTimeHours}h ({totals.worklogCountAllTime} worklogs)
                </span>
                {totals.childIssueCount > 0 && (
                  <span style={{ color: '#5b21b6', background: '#ede9fe', padding: '2px 8px', borderRadius: 4 }}>
                    {totals.childIssueCount} sous-tache(s) incluse(s)
                  </span>
                )}
              </div>
            )}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#6b7280' }}>{'×'}</button>
        </div>

        {isLoading && <div style={{ padding: 24, color: '#6b7280', textAlign: 'center' }}>Chargement...</div>}

        {worklogs.length > 0 && (
          <div style={{ overflow: 'auto', flex: 1 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb', position: 'sticky', top: 0 }}>
                  {['Date', 'Ticket', 'Sous-tache', 'Auteur', 'Temps', 'Source'].map((h) => (
                    <th key={h} style={{ padding: '6px 10px', textAlign: 'left', fontSize: 11, color: '#6b7280', fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {worklogs.map((w) => (
                  <tr key={w.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '5px 10px', whiteSpace: 'nowrap', color: '#6b7280', fontSize: 11 }}>
                      {new Date(w.startedAt).toLocaleDateString('fr-FR')}
                    </td>
                    <td style={{ padding: '5px 10px', fontFamily: 'monospace', color: '#4f94ef', fontSize: 11 }}>
                      {w.issueKey}
                    </td>
                    <td style={{ padding: '5px 10px', maxWidth: 200 }}>
                      {w.isSubtask ? (
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11 }} title={w.issueSummary ?? ''}>
                          {w.issueSummary}
                        </div>
                      ) : <span style={{ color: '#9ca3af', fontSize: 11 }}>—</span>}
                    </td>
                    <td style={{ padding: '5px 10px', fontSize: 11 }}>{w.authorDisplayName}</td>
                    <td style={{ padding: '5px 10px', fontWeight: 600, fontSize: 11 }}>{fmtDuration(w.timeSpentSeconds)}</td>
                    <td style={{ padding: '5px 10px' }}>
                      <span style={{
                        padding: '1px 5px', borderRadius: 3, fontSize: 9, fontWeight: 600,
                        background: w.source === 'TEMPO' ? '#ede9fe' : '#f3f4f6',
                        color: w.source === 'TEMPO' ? '#5b21b6' : '#6b7280',
                      }}>{w.source}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!isLoading && worklogs.length === 0 && (
          <div style={{ padding: 24, color: '#6b7280', textAlign: 'center' }}>Aucun worklog sur cette periode.</div>
        )}

        {/* Total période */}
        {worklogs.length > 0 && (
          <div style={{ padding: '8px 12px', background: '#d1fae5', borderRadius: 4, fontSize: 12, color: '#065f46', fontWeight: 600, marginTop: 8 }}>
            Total periode : {fmtDuration(worklogs.reduce((s, w) => s + w.timeSpentSeconds, 0))} ({worklogs.length} worklogs)
          </div>
        )}

        {/* Section hors période */}
        {outsideWorklogs.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#6b7280', marginBottom: 8 }}>
              Hors periode ({outsideWorklogs.length} worklogs)
            </div>
            <div style={{ overflow: 'auto', opacity: 0.7 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: '#f3f4f6', borderBottom: '1px solid #e5e7eb' }}>
                    {['Date', 'Ticket', 'Sous-tache', 'Auteur', 'Temps', 'Source'].map((h) => (
                      <th key={h} style={{ padding: '6px 10px', textAlign: 'left', fontSize: 11, color: '#9ca3af', fontWeight: 600 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {outsideWorklogs.map((w) => (
                    <tr key={w.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td style={{ padding: '5px 10px', whiteSpace: 'nowrap', color: '#9ca3af', fontSize: 11 }}>
                        {new Date(w.startedAt).toLocaleDateString('fr-FR')}
                      </td>
                      <td style={{ padding: '5px 10px', fontFamily: 'monospace', color: '#9ca3af', fontSize: 11 }}>{w.issueKey}</td>
                      <td style={{ padding: '5px 10px', maxWidth: 200 }}>
                        {w.isSubtask ? (
                          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11, color: '#9ca3af' }} title={w.issueSummary ?? ''}>
                            {w.issueSummary}
                          </div>
                        ) : <span style={{ color: '#d1d5db', fontSize: 11 }}>—</span>}
                      </td>
                      <td style={{ padding: '5px 10px', fontSize: 11, color: '#9ca3af' }}>{w.authorDisplayName}</td>
                      <td style={{ padding: '5px 10px', fontWeight: 600, fontSize: 11, color: '#9ca3af' }}>{fmtDuration(w.timeSpentSeconds)}</td>
                      <td style={{ padding: '5px 10px' }}>
                        <span style={{ padding: '1px 5px', borderRadius: 3, fontSize: 9, fontWeight: 600, background: '#f3f4f6', color: '#9ca3af' }}>{w.source}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ padding: '8px 12px', background: '#f3f4f6', borderRadius: 4, fontSize: 12, color: '#6b7280', fontWeight: 600, marginTop: 4 }}>
              Total hors periode : {fmtDuration(outsideWorklogs.reduce((s, w) => s + w.timeSpentSeconds, 0))} ({outsideWorklogs.length} worklogs)
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = { display: 'block', fontSize: 12, color: '#6b7280', marginBottom: 4 };
const inputStyle: React.CSSProperties = { padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13, minWidth: 180 };
const thStyle: React.CSSProperties = { padding: '10px 16px', textAlign: 'left', fontSize: 12, color: '#6b7280', fontWeight: 600, whiteSpace: 'nowrap' };
const tdStyle: React.CSSProperties = { padding: '10px 16px' };
const smallActionBtnStyle: React.CSSProperties = { padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db', background: '#fff', fontSize: 12, cursor: 'pointer', color: '#374151' };
