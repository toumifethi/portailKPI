import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { issueLinksApi, clientsApi, jiraUsersApi } from '@/api/endpoints';

const PAGE_SIZE = 50;

interface ReturnSummaryRow {
  id: number;
  jiraKey: string;
  summary: string;
  issueType: string;
  status: string;
  assignee: string | null;
  nbRetourInterne: number;
  nbRetourClient: number;
  nbRetourAutre: number;
  nbRetourTotal: number;
}

interface ReturnDetailRow {
  id: number;
  jiraKey: string;
  summary: string;
  issueType: string;
  status: string;
  assignee: string | null;
  timeSpentHours: number | null;
  returnCategory: 'interne' | 'client' | 'autre';
}

interface ReturnsSummaryResponse {
  data: ReturnSummaryRow[];
  total: number;
  page: number;
  limit: number;
  config: { internalTypes: string[]; clientTypes: string[]; returnLinkType: string };
}

function fmtHours(hours: number | null): string {
  if (hours === null || hours === 0) return '\u2014';
  return `${hours.toFixed(1)}h`;
}

// ── Modal ──

function ReturnDetailModal({ issueId, jiraKey, onClose }: { issueId: number; jiraKey: string; onClose: () => void }) {
  const { data, isLoading, isError } = useQuery<ReturnDetailRow[]>({
    queryKey: ['returns-detail', issueId],
    queryFn: () => issueLinksApi.returnsDetail(issueId),
  });

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#111827', margin: 0 }}>
            Retours &mdash; {jiraKey}
          </h2>
          <button onClick={onClose} style={closeBtnStyle}>&times;</button>
        </div>

        <div style={{ overflow: 'auto', maxHeight: 'calc(80vh - 80px)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                {['Clé', 'Résumé', 'Type', 'Statut', 'Assigné', 'Catégorie', 'Temps passé'].map(h => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={7} style={emptyTdStyle}>Chargement...</td></tr>
              ) : isError ? (
                <tr><td colSpan={7} style={{ ...emptyTdStyle, color: '#b91c1c' }}>Erreur de chargement.</td></tr>
              ) : !data || data.length === 0 ? (
                <tr><td colSpan={7} style={emptyTdStyle}>Aucun retour trouvé.</td></tr>
              ) : (
                data.map((row) => (
                  <tr key={row.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={tdStyle}>
                      <span style={{ fontFamily: 'monospace', color: '#4f94ef' }}>{row.jiraKey}</span>
                    </td>
                    <td style={{ ...tdStyle, maxWidth: 300 }}>
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={row.summary}>
                        {row.summary}
                      </div>
                    </td>
                    <td style={tdStyle}><span style={typeBadge(row.issueType)}>{row.issueType}</span></td>
                    <td style={tdStyle}><span style={statusBadge(row.status)}>{row.status}</span></td>
                    <td style={tdStyle}>{row.assignee ?? '\u2014'}</td>
                    <td style={tdStyle}><span style={categoryBadge(row.returnCategory)}>{row.returnCategory}</span></td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{fmtHours(row.timeSpentHours)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Page ──

export default function IssueLinksPage() {
  const [clientId, setClientId] = useState('');
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [projectId, setProjectId] = useState('');
  const [assigneeAccountId, setAssigneeAccountId] = useState('');
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState<{ issueId: number; jiraKey: string } | null>(null);

  const { data: clients } = useQuery({ queryKey: ['clients'], queryFn: clientsApi.list });
  const { data: jiraUsers } = useQuery({ queryKey: ['jira-users-all'], queryFn: () => jiraUsersApi.list() });

  // Load projects for selected client
  const selectedClientId = clientId ? Number(clientId) : undefined;
  const { data: projects } = useQuery({
    queryKey: ['client-projects', selectedClientId],
    queryFn: () => clientsApi.getProjects(selectedClientId!),
    enabled: !!selectedClientId,
  });

  const queryEnabled = !!selectedClientId;

  const { data, isLoading, isError, isFetching } = useQuery<ReturnsSummaryResponse>({
    queryKey: ['returns-summary', selectedClientId, periodStart, periodEnd, projectId, assigneeAccountId, page],
    queryFn: () =>
      issueLinksApi.returnsSummary({
        clientId: selectedClientId!,
        ...(periodStart ? { periodStart } : {}),
        ...(periodEnd ? { periodEnd } : {}),
        ...(projectId ? { projectId: Number(projectId) } : {}),
        ...(assigneeAccountId ? { assigneeAccountId } : {}),
        page,
        limit: PAGE_SIZE,
      }),
    enabled: queryEnabled,
    placeholderData: (prev: ReturnsSummaryResponse | undefined) => prev,
  });

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 1;
  const rows = data?.data ?? [];

  // Compute totals
  const totals = rows.reduce(
    (acc, r) => ({
      nbRetourInterne: acc.nbRetourInterne + r.nbRetourInterne,
      nbRetourClient: acc.nbRetourClient + r.nbRetourClient,
      nbRetourAutre: acc.nbRetourAutre + r.nbRetourAutre,
      nbRetourTotal: acc.nbRetourTotal + r.nbRetourTotal,
    }),
    { nbRetourInterne: 0, nbRetourClient: 0, nbRetourAutre: 0, nbRetourTotal: 0 },
  );

  function resetFilters() {
    setClientId('');
    setPeriodStart('');
    setPeriodEnd('');
    setProjectId('');
    setAssigneeAccountId('');
    setPage(1);
  }

  function handleCountClick(row: ReturnSummaryRow, _category: string) {
    setModal({ issueId: row.id, jiraKey: row.jiraKey });
  }

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111827', marginBottom: 20 }}>Analyse des retours</h1>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20, alignItems: 'flex-end' }}>
        <div>
          <label style={labelStyle}>Client</label>
          <select
            value={clientId}
            onChange={(e) => { setClientId(e.target.value); setProjectId(''); setPage(1); }}
            style={inputStyle}
          >
            <option value="">-- Sélectionner --</option>
            {clients?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        <div>
          <label style={labelStyle}>Période début</label>
          <input type="date" value={periodStart} onChange={(e) => { setPeriodStart(e.target.value); setPage(1); }} style={inputStyle} />
        </div>

        <div>
          <label style={labelStyle}>P\u00e9riode fin</label>
          <input type="date" value={periodEnd} onChange={(e) => { setPeriodEnd(e.target.value); setPage(1); }} style={inputStyle} />
        </div>

        <div>
          <label style={labelStyle}>Projet</label>
          <select
            value={projectId}
            onChange={(e) => { setProjectId(e.target.value); setPage(1); }}
            style={inputStyle}
            disabled={!selectedClientId}
          >
            <option value="">Tous les projets</option>
            {projects?.map((p) => <option key={p.id} value={p.id}>{p.jiraProjectName}</option>)}
          </select>
        </div>

        <div>
          <label style={labelStyle}>Assign\u00e9</label>
          <select
            value={assigneeAccountId}
            onChange={(e) => { setAssigneeAccountId(e.target.value); setPage(1); }}
            style={inputStyle}
          >
            <option value="">Tous</option>
            {jiraUsers?.map((ju) => (
              <option key={ju.jiraAccountId} value={ju.jiraAccountId}>
                {ju.collaborator ? `${ju.collaborator.firstName} ${ju.collaborator.lastName}` : ju.displayName}
              </option>
            ))}
          </select>
        </div>

        <button onClick={resetFilters} style={resetBtnStyle}>R\u00e9initialiser</button>
      </div>

      {!queryEnabled && (
        <div style={{ padding: 32, textAlign: 'center', color: '#6b7280', background: '#f9fafb', borderRadius: 8, border: '1px solid #e5e7eb' }}>
          S\u00e9lectionnez un client pour afficher l'analyse des retours.
        </div>
      )}

      {queryEnabled && (
        <>
          {/* Counter */}
          <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 12 }}>
            {isError && <span style={{ color: '#b91c1c' }}>Erreur lors du chargement.</span>}
            {data && `${data.total.toLocaleString('fr-FR')} ticket(s) de d\u00e9veloppement avec retours`}
            {isFetching && !isLoading ? ' \u00b7 chargement...' : ''}
          </div>

          {/* Table */}
          <div style={{ background: 'white', borderRadius: 8, border: '1px solid #e5e7eb', overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                  {['Cl\u00e9', 'R\u00e9sum\u00e9', 'Type', 'Statut', 'Assign\u00e9', 'Retours internes', 'Retours clients', 'Autres', 'Total'].map(h => (
                    <th key={h} style={thStyle}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={9} style={emptyTdStyle}>Chargement...</td></tr>
                ) : isError ? (
                  <tr><td colSpan={9} style={{ ...emptyTdStyle, color: '#b91c1c' }}>Erreur de chargement.</td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={9} style={emptyTdStyle}>Aucun ticket avec retours trouv\u00e9.</td></tr>
                ) : (
                  <>
                    {rows.map((row) => (
                      <tr key={row.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                        <td style={tdStyle}>
                          <span style={{ fontFamily: 'monospace', color: '#4f94ef' }}>{row.jiraKey}</span>
                        </td>
                        <td style={{ ...tdStyle, maxWidth: 300 }}>
                          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={row.summary}>
                            {row.summary}
                          </div>
                        </td>
                        <td style={tdStyle}><span style={typeBadge(row.issueType)}>{row.issueType}</span></td>
                        <td style={tdStyle}><span style={statusBadge(row.status)}>{row.status}</span></td>
                        <td style={tdStyle}>{row.assignee ?? '\u2014'}</td>
                        <td style={{ ...tdStyle, textAlign: 'center' }}>
                          {row.nbRetourInterne > 0
                            ? <button onClick={() => handleCountClick(row, 'interne')} style={linkBtnStyle}>{row.nbRetourInterne}</button>
                            : '\u2014'}
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'center' }}>
                          {row.nbRetourClient > 0
                            ? <button onClick={() => handleCountClick(row, 'client')} style={linkBtnStyle}>{row.nbRetourClient}</button>
                            : '\u2014'}
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'center' }}>
                          {row.nbRetourAutre > 0
                            ? <button onClick={() => handleCountClick(row, 'autre')} style={linkBtnStyle}>{row.nbRetourAutre}</button>
                            : '\u2014'}
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 600 }}>
                          {row.nbRetourTotal > 0
                            ? <button onClick={() => handleCountClick(row, 'total')} style={linkBtnStyle}>{row.nbRetourTotal}</button>
                            : '\u2014'}
                        </td>
                      </tr>
                    ))}
                    {/* Totals row */}
                    <tr style={{ borderTop: '2px solid #e5e7eb', background: '#f9fafb', fontWeight: 700 }}>
                      <td colSpan={5} style={{ ...tdStyle, textAlign: 'right', color: '#374151' }}>Total (page)</td>
                      <td style={{ ...tdStyle, textAlign: 'center', color: '#374151' }}>{totals.nbRetourInterne}</td>
                      <td style={{ ...tdStyle, textAlign: 'center', color: '#374151' }}>{totals.nbRetourClient}</td>
                      <td style={{ ...tdStyle, textAlign: 'center', color: '#374151' }}>{totals.nbRetourAutre}</td>
                      <td style={{ ...tdStyle, textAlign: 'center', color: '#374151' }}>{totals.nbRetourTotal}</td>
                    </tr>
                  </>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 20, alignItems: 'center' }}>
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} style={pageBtnStyle(page === 1)}>
                {'\u2190 Pr\u00e9c\u00e9dent'}
              </button>
              <span style={{ fontSize: 13, color: '#374151' }}>Page {page} / {totalPages}</span>
              <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} style={pageBtnStyle(page === totalPages)}>
                {'Suivant \u2192'}
              </button>
            </div>
          )}
        </>
      )}

      {/* Detail Modal */}
      {modal && (
        <ReturnDetailModal
          issueId={modal.issueId}
          jiraKey={modal.jiraKey}
          onClose={() => setModal(null)}
        />
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
const resetBtnStyle: React.CSSProperties = { padding: '6px 14px', border: '1px solid #d1d5db', borderRadius: 6, background: 'white', cursor: 'pointer', fontSize: 13 };

const pageBtnStyle = (disabled: boolean): React.CSSProperties => ({
  padding: '6px 14px', border: '1px solid #d1d5db', borderRadius: 6,
  background: disabled ? '#f9fafb' : 'white', color: disabled ? '#9ca3af' : '#374151',
  cursor: disabled ? 'default' : 'pointer', fontSize: 13,
});

const linkBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: '#2563eb',
  textDecoration: 'underline',
  cursor: 'pointer',
  fontSize: 13,
  fontWeight: 600,
  padding: 0,
};

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.4)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
};

const modalStyle: React.CSSProperties = {
  background: 'white',
  borderRadius: 12,
  padding: 24,
  width: '90vw',
  maxWidth: 900,
  maxHeight: '85vh',
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
  boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
};

const closeBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  fontSize: 24,
  cursor: 'pointer',
  color: '#6b7280',
  lineHeight: 1,
  padding: '4px 8px',
};

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
  if (s.includes('done') || s.includes('closed') || s.includes('resolved'))
    return { padding: '2px 7px', borderRadius: 4, fontSize: 11, background: '#d1fae5', color: '#065f46' };
  if (s.includes('progress') || s.includes('review'))
    return { padding: '2px 7px', borderRadius: 4, fontSize: 11, background: '#dbeafe', color: '#1d4ed8' };
  return { padding: '2px 7px', borderRadius: 4, fontSize: 11, background: '#f3f4f6', color: '#374151' };
}

function categoryBadge(cat: string): React.CSSProperties {
  const map: Record<string, { bg: string; color: string }> = {
    interne: { bg: '#fef3c7', color: '#92400e' },
    client: { bg: '#fee2e2', color: '#b91c1c' },
    autre: { bg: '#f3f4f6', color: '#374151' },
  };
  const c = map[cat] ?? { bg: '#f3f4f6', color: '#374151' };
  return { padding: '2px 7px', borderRadius: 4, fontSize: 11, fontWeight: 500, background: c.bg, color: c.color };
}
