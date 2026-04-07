import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { worklogsApi, clientsApi, jiraUsersApi } from '@/api/endpoints';
import { MultiSelectDropdown } from '@/components/shared/MultiSelectDropdown';

const PAGE_SIZE = 50;

function fmt(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return m > 0 ? `${h}h${m.toString().padStart(2, '0')}` : `${h}h`;
}

export default function WorklogsPage() {
  const [clientId, setClientId] = useState('');
  const [selectedAuthors, setSelectedAuthors] = useState<string[]>([]);
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [page, setPage] = useState(1);

  const { data: clients } = useQuery({ queryKey: ['clients'], queryFn: clientsApi.list });
  const { data: jiraUsers } = useQuery({ queryKey: ['jira-users-all'], queryFn: () => jiraUsersApi.list() });

  const params = {
    ...(clientId ? { clientId: Number(clientId) } : {}),
    ...(selectedAuthors.length > 0 ? { authorAccountId: selectedAuthors.join(',') } : {}),
    ...(periodStart ? { periodStart } : {}),
    ...(periodEnd ? { periodEnd } : {}),
    page,
    limit: PAGE_SIZE,
  };

  const { data, isLoading, isError, isFetching } = useQuery({
    queryKey: ['worklogs', params],
    queryFn: () => worklogsApi.list(params),
    placeholderData: (prev) => prev,
  });

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 1;
  const jiraUserList = jiraUsers ?? [];
  const pageTotal = data?.data.reduce((s, w) => s + w.timeSpentSeconds, 0) ?? 0;

  function resetFilters() {
    setClientId('');
    setSelectedAuthors([]);
    setPeriodStart('');
    setPeriodEnd('');
    setPage(1);
  }

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111827', marginBottom: 20 }}>Worklogs</h1>

      {/* Filtres */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20, alignItems: 'flex-end' }}>
        <div>
          <label style={labelStyle}>Client</label>
          <select value={clientId} onChange={(e) => { setClientId(e.target.value); setPage(1); }} style={inputStyle}>
            <option value="">Tous les clients</option>
            {clients?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        <div>
          <label style={labelStyle}>Auteur</label>
          <MultiSelectDropdown
            options={jiraUserList.map((ju) => ({
              value: ju.jiraAccountId,
              label: ju.collaborator ? `${ju.collaborator.firstName} ${ju.collaborator.lastName}` : ju.displayName,
            }))}
            selected={selectedAuthors}
            onChange={(v) => { setSelectedAuthors(v); setPage(1); }}
            placeholder="Tous"
          />
        </div>

        <div>
          <label style={labelStyle}>Depuis</label>
          <input type="date" value={periodStart} onChange={(e) => { setPeriodStart(e.target.value); setPage(1); }} style={inputStyle} />
        </div>

        <div>
          <label style={labelStyle}>Jusqu'à</label>
          <input type="date" value={periodEnd} onChange={(e) => { setPeriodEnd(e.target.value); setPage(1); }} style={inputStyle} />
        </div>

        <button onClick={resetFilters} style={resetBtnStyle}>Réinitialiser</button>
      </div>

      {/* Compteur */}
      <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 12 }}>
        {isError && <span style={{ color: '#b91c1c' }}>Erreur lors du chargement.</span>}
        {data && `${data.total.toLocaleString('fr-FR')} worklog(s)`}
        {pageTotal > 0 ? ` · ${fmt(pageTotal)} sur cette page` : ''}
        {isFetching && !isLoading ? ' · chargement…' : ''}
      </div>

      {/* Tableau */}
      <div style={{ background: 'white', borderRadius: 8, border: '1px solid #e5e7eb', overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
              {['Date', 'Client / Projet', 'Issue', 'Résumé', 'Auteur', 'Temps', 'Source'].map((h) => (
                <th key={h} style={thStyle}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={7} style={emptyTdStyle}>Chargement…</td></tr>
            ) : isError ? (
              <tr><td colSpan={7} style={{ ...emptyTdStyle, color: '#b91c1c' }}>Erreur de chargement.</td></tr>
            ) : data?.data.length === 0 ? (
              <tr><td colSpan={7} style={emptyTdStyle}>Aucun worklog trouvé.</td></tr>
            ) : (
              data?.data.map((wl) => (
                <tr key={wl.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                    {new Date(wl.startedAt).toLocaleDateString('fr-FR')}
                  </td>
                  <td style={tdStyle}>
                    <div style={{ fontWeight: 500 }}>{wl.issue.project.client.name}</div>
                    <div style={{ color: '#6b7280', fontSize: 12 }}>{wl.issue.project.jiraProjectName}</div>
                  </td>
                  <td style={tdStyle}>
                    <span style={{ fontFamily: 'monospace', color: '#4f94ef' }}>{wl.issue.jiraKey}</span>
                  </td>
                  <td style={{ ...tdStyle, maxWidth: 280 }}>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                         title={wl.issue.summary}>{wl.issue.summary}</div>
                  </td>
                  <td style={tdStyle}>{wl.authorDisplayName}</td>
                  <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 500 }}>
                    {fmt(wl.timeSpentSeconds)}
                  </td>
                  <td style={tdStyle}>
                    <span style={sourceBadge(wl.source)}>{wl.source}</span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 20, alignItems: 'center' }}>
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} style={pageBtnStyle(page === 1)}>
            ← Précédent
          </button>
          <span style={{ fontSize: 13, color: '#374151' }}>Page {page} / {totalPages}</span>
          <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} style={pageBtnStyle(page === totalPages)}>
            Suivant →
          </button>
        </div>
      )}
    </div>
  );
}

const labelStyle: React.CSSProperties = { display: 'block', fontSize: 11, color: '#6b7280', fontWeight: 600, marginBottom: 4 };
const inputStyle: React.CSSProperties = { padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, minWidth: 160 };
const thStyle: React.CSSProperties = { padding: '10px 12px', textAlign: 'left', fontSize: 12, color: '#6b7280', fontWeight: 600, whiteSpace: 'nowrap' };
const tdStyle: React.CSSProperties = { padding: '8px 12px' };
const emptyTdStyle: React.CSSProperties = { padding: 32, textAlign: 'center', color: '#6b7280' };
const resetBtnStyle: React.CSSProperties = { padding: '6px 14px', border: '1px solid #d1d5db', borderRadius: 6, background: 'white', cursor: 'pointer', fontSize: 13 };
const pageBtnStyle = (disabled: boolean): React.CSSProperties => ({
  padding: '6px 14px', border: '1px solid #d1d5db', borderRadius: 6,
  background: disabled ? '#f9fafb' : 'white', color: disabled ? '#9ca3af' : '#374151',
  cursor: disabled ? 'default' : 'pointer', fontSize: 13,
});

function sourceBadge(source: string): React.CSSProperties {
  return source === 'TEMPO'
    ? { padding: '2px 7px', borderRadius: 4, fontSize: 11, background: '#ede9fe', color: '#5b21b6' }
    : { padding: '2px 7px', borderRadius: 4, fontSize: 11, background: '#dbeafe', color: '#1d4ed8' };
}
