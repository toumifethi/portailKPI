import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { issueLinksApi, issuesApi, clientsApi } from '@/api/endpoints';

function CheckboxGroup({ label, items, selected, onToggle, loading, disabled }: {
  label: string;
  items: string[];
  selected: string[];
  onToggle: (item: string) => void;
  loading?: boolean;
  disabled?: string;
}) {
  const allSelected = items.length > 0 && items.every((i) => selected.includes(i));
  function toggleAll() {
    if (allSelected) {
      for (const i of items) onToggle(i);
    } else {
      for (const i of items) {
        if (!selected.includes(i)) onToggle(i);
      }
    }
  }
  return (
    <div style={{ flex: 1, minWidth: 250 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <label style={{ fontSize: 11, color: '#6b7280', fontWeight: 600 }}>
          {label}
          {loading && <span style={{ color: '#9ca3af', fontWeight: 400 }}> (chargement...)</span>}
          {disabled && <span style={{ color: '#9ca3af', fontWeight: 400 }}> ({disabled})</span>}
        </label>
        {items.length > 0 && (
          <button onClick={toggleAll} style={{
            padding: '1px 7px', fontSize: 10, borderRadius: 3, cursor: 'pointer',
            border: '1px solid #d1d5db', background: allSelected ? '#eef2ff' : 'white',
            color: allSelected ? '#4f46e5' : '#6b7280', fontWeight: 600,
          }}>
            {allSelected ? 'Tout decocher' : 'Tout cocher'}
          </button>
        )}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, minHeight: 28 }}>
        {items.map((item) => {
          const sel = selected.includes(item);
          return (
            <label key={item} style={{
              display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, cursor: 'pointer',
              padding: '3px 9px', borderRadius: 5,
              background: sel ? '#dbeafe' : '#f3f4f6',
              color: sel ? '#1d4ed8' : '#374151',
              border: sel ? '1px solid #93c5fd' : '1px solid #e5e7eb',
            }}>
              <input type="checkbox" checked={sel} onChange={() => onToggle(item)}
                style={{ accentColor: '#4f46e5', width: 12, height: 12 }} />
              {item}
            </label>
          );
        })}
      </div>
    </div>
  );
}

const PAGE_SIZE = 50;

interface LinkedIssue {
  linkType: string;
  issueId: number;
  jiraKey: string;
  summary: string;
  issueType: string;
  status: string;
  assignee: string | null;
  estimateHours: number | null;
  timeSpentHours: number | null;
  remainingHours: number | null;
}

interface MainTicketRow {
  id: number;
  jiraKey: string;
  summary: string;
  issueType: string;
  status: string;
  assignee: string | null;
  nbLinked: number;
  linkedIssues: LinkedIssue[];
}

interface SummaryResponse {
  data: MainTicketRow[];
  total: number;
  page: number;
  limit: number;
  linkTypes: string[];
}

function fmtHours(hours: number | null): string {
  if (hours === null || hours === 0) return '\u2014';
  return `${hours.toFixed(1)}h`;
}

export default function IssueLinksPage() {
  const [clientId, setClientId] = useState<number | undefined>(undefined);
  const [selectedLinkTypes, setSelectedLinkTypes] = useState<string[]>([]);
  const [selectedIssueTypes, setSelectedIssueTypes] = useState<string[]>([]);
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [page, setPage] = useState(1);
  const [expandedRow, setExpandedRow] = useState<number | null>(null);

  const { data: clients = [] } = useQuery({
    queryKey: ['clients'],
    queryFn: () => clientsApi.list(),
  });

  const { data: linkTypes = [], isLoading: linkTypesLoading } = useQuery({
    queryKey: ['link-types', clientId],
    queryFn: () => issuesApi.listLinkTypes(clientId),
    enabled: !!clientId,
    staleTime: 60_000,
  });

  const { data: issueTypes = [], isLoading: issueTypesLoading } = useQuery({
    queryKey: ['issueTypes', clientId],
    queryFn: () => issuesApi.listTypes(clientId),
    enabled: !!clientId,
    staleTime: 60_000,
  });

  const queryEnabled = !!clientId && selectedLinkTypes.length > 0;

  const { data, isLoading, isError, isFetching } = useQuery<SummaryResponse>({
    queryKey: ['returns-summary', clientId, selectedLinkTypes, selectedIssueTypes, periodStart, periodEnd, page],
    queryFn: () =>
      issueLinksApi.returnsSummary({
        clientId: clientId!,
        linkTypes: selectedLinkTypes.join(','),
        ...(selectedIssueTypes.length > 0 ? { issueTypes: selectedIssueTypes.join(',') } : {}),
        ...(periodStart ? { periodStart } : {}),
        ...(periodEnd ? { periodEnd } : {}),
        page,
        limit: PAGE_SIZE,
      }),
    enabled: queryEnabled,
    placeholderData: (prev: SummaryResponse | undefined) => prev,
  });

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 1;
  const rows = data?.data ?? [];

  function toggleLinkType(lt: string) {
    setSelectedLinkTypes((prev) =>
      prev.includes(lt) ? prev.filter((t) => t !== lt) : [...prev, lt],
    );
    setPage(1);
    setExpandedRow(null);
  }

  function toggleIssueType(it: string) {
    setSelectedIssueTypes((prev) =>
      prev.includes(it) ? prev.filter((t) => t !== it) : [...prev, it],
    );
    setPage(1);
    setExpandedRow(null);
  }

  function handleClientChange(id: number | undefined) {
    setClientId(id);
    setSelectedLinkTypes([]);
    setSelectedIssueTypes([]);
    setPage(1);
    setExpandedRow(null);
  }

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111827', marginBottom: 20 }}>Analyse des liens</h1>

      {/* Filtres */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20, background: 'white', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16 }}>
        {/* Ligne 1 : Client + Periode */}
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <label style={labelStyle}>Client</label>
            <select
              value={clientId ?? ''}
              onChange={(e) => handleClientChange(e.target.value ? Number(e.target.value) : undefined)}
              style={inputStyle}
            >
              <option value="">-- Selectionner un client --</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Periode debut</label>
            <input type="date" value={periodStart} onChange={(e) => { setPeriodStart(e.target.value); setPage(1); }} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Periode fin</label>
            <input type="date" value={periodEnd} onChange={(e) => { setPeriodEnd(e.target.value); setPage(1); }} style={inputStyle} />
          </div>
        </div>

        {/* Ligne 2 : Types de liens */}
        <CheckboxGroup
          label="Types de liens"
          items={linkTypes}
          selected={selectedLinkTypes}
          onToggle={toggleLinkType}
          loading={linkTypesLoading && !!clientId}
          disabled={!clientId ? 'choisir un client' : undefined}
        />

        {/* Ligne 3 : Types d'issues */}
        <CheckboxGroup
          label="Types d'issues"
          items={issueTypes}
          selected={selectedIssueTypes}
          onToggle={toggleIssueType}
          loading={issueTypesLoading && !!clientId}
          disabled={!clientId ? 'choisir un client' : undefined}
        />
      </div>

      {/* Message si pas pret */}
      {!queryEnabled && (
        <div style={{ padding: 32, textAlign: 'center', color: '#6b7280', background: '#f9fafb', borderRadius: 8, border: '1px solid #e5e7eb' }}>
          {!clientId ? 'Selectionnez un client pour commencer.' : 'Selectionnez au moins un type de lien.'}
        </div>
      )}

      {/* Resultats */}
      {queryEnabled && (
        <>
          <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 12 }}>
            {isError && <span style={{ color: '#b91c1c' }}>Erreur lors du chargement.</span>}
            {data && `${data.total.toLocaleString('fr-FR')} ticket(s) principal(aux) avec des liens`}
            {isFetching && !isLoading ? ' · chargement...' : ''}
          </div>

          <div style={{ background: 'white', borderRadius: 8, border: '1px solid #e5e7eb', overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                  {['', 'Cle', 'Resume', 'Type', 'Statut', 'Assigne', 'Types de liens', 'Nb liens'].map(h => (
                    <th key={h} style={thStyle}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={8} style={emptyTdStyle}>Chargement...</td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={8} style={emptyTdStyle}>Aucun ticket avec liens trouve.</td></tr>
                ) : (
                  rows.map((row) => {
                    const isExpanded = expandedRow === row.id;
                    return (
                      <React.Fragment key={row.id}>
                        <tr
                          style={{ borderBottom: '1px solid #f3f4f6', cursor: 'pointer', background: isExpanded ? '#f0f9ff' : undefined }}
                          onClick={() => setExpandedRow(isExpanded ? null : row.id)}
                        >
                          <td style={{ ...tdStyle, width: 28, textAlign: 'center', color: '#6b7280' }}>
                            {isExpanded ? '\u25BC' : '\u25B6'}
                          </td>
                          <td style={tdStyle}>
                            <span style={{ fontFamily: 'monospace', color: '#4f94ef' }}>{row.jiraKey}</span>
                          </td>
                          <td style={{ ...tdStyle, maxWidth: 350 }}>
                            <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={row.summary}>
                              {row.summary}
                            </div>
                          </td>
                          <td style={tdStyle}><span style={typeBadge(row.issueType)}>{row.issueType}</span></td>
                          <td style={tdStyle}><span style={statusBadge(row.status)}>{row.status}</span></td>
                          <td style={tdStyle}>{row.assignee ?? '\u2014'}</td>
                          <td style={tdStyle}>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                              {[...new Set(row.linkedIssues.map((li) => li.linkType))].map((lt) => (
                                <span key={lt} style={{ padding: '1px 6px', borderRadius: 4, fontSize: 10, background: '#ede9fe', color: '#6d28d9', whiteSpace: 'nowrap' }}>
                                  {lt}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 600 }}>
                            <span style={{
                              display: 'inline-block', minWidth: 24, padding: '2px 8px', borderRadius: 10,
                              background: '#dbeafe', color: '#1d4ed8', fontSize: 12,
                            }}>
                              {row.nbLinked}
                            </span>
                          </td>
                        </tr>

                        {/* Sous-tableau des issues liees */}
                        {isExpanded && row.linkedIssues.length > 0 && (
                          <tr>
                            <td colSpan={8} style={{ padding: 0 }}>
                              <div style={{ margin: '0 0 0 40px', padding: '8px 0' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                                  <thead>
                                    <tr style={{ background: '#f1f5f9', borderBottom: '1px solid #e2e8f0' }}>
                                      {['Type de lien', 'Cle', 'Resume', 'Type issue', 'Statut', 'Assigne', 'Estime', 'Consomme', 'Restant'].map(h => (
                                        <th key={h} style={{ ...thStyle, fontSize: 11 }}>{h}</th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {row.linkedIssues.map((li, idx) => (
                                      <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                        <td style={tdStyle}>
                                          <span style={{ padding: '1px 6px', borderRadius: 4, fontSize: 11, background: '#ede9fe', color: '#6d28d9' }}>
                                            {li.linkType}
                                          </span>
                                        </td>
                                        <td style={tdStyle}>
                                          <span style={{ fontFamily: 'monospace', color: '#4f94ef', fontSize: 11 }}>{li.jiraKey}</span>
                                        </td>
                                        <td style={{ ...tdStyle, maxWidth: 300 }}>
                                          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={li.summary}>
                                            {li.summary}
                                          </div>
                                        </td>
                                        <td style={tdStyle}><span style={typeBadge(li.issueType)}>{li.issueType}</span></td>
                                        <td style={tdStyle}><span style={statusBadge(li.status)}>{li.status}</span></td>
                                        <td style={tdStyle}>{li.assignee ?? '\u2014'}</td>
                                        <td style={{ ...tdStyle, textAlign: 'right' }}>{fmtHours(li.estimateHours)}</td>
                                        <td style={{ ...tdStyle, textAlign: 'right' }}>
                                          {li.timeSpentHours ? (
                                            <a
                                              href={`/worklogs?issueId=${li.issueId}`}
                                              onClick={(e) => { e.stopPropagation(); }}
                                              style={{ color: '#2563eb', textDecoration: 'underline', cursor: 'pointer', fontSize: 12 }}
                                              title="Voir le detail des worklogs"
                                            >
                                              {fmtHours(li.timeSpentHours)}
                                            </a>
                                          ) : '\u2014'}
                                        </td>
                                        <td style={{ ...tdStyle, textAlign: 'right' }}>{fmtHours(li.remainingHours)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 20, alignItems: 'center' }}>
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} style={pageBtnStyle(page === 1)}>
                {'\u2190 Precedent'}
              </button>
              <span style={{ fontSize: 13, color: '#374151' }}>Page {page} / {totalPages}</span>
              <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} style={pageBtnStyle(page === totalPages)}>
                {'Suivant \u2192'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Styles ──

const labelStyle: React.CSSProperties = { display: 'block', fontSize: 11, color: '#6b7280', fontWeight: 600, marginBottom: 4 };
const inputStyle: React.CSSProperties = { padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, minWidth: 140 };
const thStyle: React.CSSProperties = { padding: '10px 12px', textAlign: 'left', fontSize: 12, color: '#6b7280', fontWeight: 600, whiteSpace: 'nowrap' };
const tdStyle: React.CSSProperties = { padding: '8px 12px' };
const emptyTdStyle: React.CSSProperties = { padding: 32, textAlign: 'center', color: '#6b7280' };

const pageBtnStyle = (disabled: boolean): React.CSSProperties => ({
  padding: '6px 14px', border: '1px solid #d1d5db', borderRadius: 6,
  background: disabled ? '#f9fafb' : 'white', color: disabled ? '#9ca3af' : '#374151',
  cursor: disabled ? 'default' : 'pointer', fontSize: 13,
});

function typeBadge(type: string): React.CSSProperties {
  const map: Record<string, { bg: string; color: string }> = {
    Epic: { bg: '#ede9fe', color: '#5b21b6' },
    Story: { bg: '#dbeafe', color: '#1d4ed8' },
    Bug: { bg: '#fee2e2', color: '#b91c1c' },
    Task: { bg: '#d1fae5', color: '#065f46' },
    'Sub-task': { bg: '#f3f4f6', color: '#374151' },
  };
  const c = map[type] ?? { bg: '#f3f4f6', color: '#374151' };
  return { padding: '2px 7px', borderRadius: 4, fontSize: 11, fontWeight: 500, background: c.bg, color: c.color };
}

function statusBadge(status: string): React.CSSProperties {
  const s = status.toLowerCase();
  if (s.includes('done') || s.includes('closed') || s.includes('resolved') || s.includes('termin'))
    return { padding: '2px 7px', borderRadius: 4, fontSize: 11, background: '#d1fae5', color: '#065f46' };
  if (s.includes('progress') || s.includes('review') || s.includes('cours'))
    return { padding: '2px 7px', borderRadius: 4, fontSize: 11, background: '#dbeafe', color: '#1d4ed8' };
  return { padding: '2px 7px', borderRadius: 4, fontSize: 11, background: '#f3f4f6', color: '#374151' };
}
