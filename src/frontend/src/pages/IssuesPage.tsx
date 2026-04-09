import React, { useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { issuesApi, clientsApi, jiraUsersApi } from '@/api/endpoints';
import { MultiSelectDropdown } from '@/components/shared/MultiSelectDropdown';

const PAGE_SIZE = 50;

function fmt(seconds: number | null): string {
  if (seconds === null || seconds === 0) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return m > 0 ? `${h}h${m.toString().padStart(2, '0')}` : `${h}h`;
}

function fmtHours(hours: number | null): string {
  if (hours === null || hours === 0) return '—';
  return `${hours.toFixed(1)}h`;
}

// ── Multi-select checkbox dropdown ──

function StatusFilter({ selected, onChange }: { selected: string[]; onChange: (v: string[]) => void }) {
  const { data: allStatuses } = useQuery({
    queryKey: ['issueStatuses'],
    queryFn: issuesApi.listStatuses,
    staleTime: 60_000,
  });

  return (
    <MultiSelectDropdown
      options={(allStatuses ?? []).map((s) => ({ value: s, label: s }))}
      selected={selected}
      onChange={onChange}
      placeholder="Tous les statuts"
    />
  );
}

function IssueTypeFilter({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (types: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const { data: allTypes } = useQuery({
    queryKey: ['issueTypes'],
    queryFn: () => issuesApi.listTypes(),
    staleTime: 60_000,
  });

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const toggle = (type: string) => {
    if (selected.includes(type)) {
      onChange(selected.filter((t) => t !== type));
    } else {
      onChange([...selected, type]);
    }
  };

  const label =
    selected.length === 0
      ? 'Tous les types'
      : selected.length <= 2
        ? selected.join(', ')
        : `${selected.length} types`;

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          ...inputStyle,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          background: 'white',
          minWidth: 160,
        }}
      >
        <span style={{ flex: 1, textAlign: 'left' }}>{label}</span>
        <span style={{ fontSize: 10 }}>{open ? '\u25B2' : '\u25BC'}</span>
      </button>
      {open && allTypes && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            zIndex: 50,
            background: 'white',
            border: '1px solid #d1d5db',
            borderRadius: 6,
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
            marginTop: 4,
            maxHeight: 240,
            overflowY: 'auto',
            minWidth: 180,
          }}
        >
          {allTypes.map((type) => (
            <label
              key={type}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 12px',
                cursor: 'pointer',
                fontSize: 13,
              }}
              onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = '#f3f4f6')}
              onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = 'transparent')}
            >
              <input
                type="checkbox"
                checked={selected.includes(type)}
                onChange={() => toggle(type)}
                style={{ accentColor: '#4f46e5' }}
              />
              <span style={typeBadge(type)}>{type}</span>
            </label>
          ))}
          {selected.length > 0 && (
            <button
              onClick={() => onChange([])}
              style={{
                width: '100%',
                padding: '6px 12px',
                fontSize: 12,
                color: '#6b7280',
                background: '#f9fafb',
                border: 'none',
                borderTop: '1px solid #e5e7eb',
                cursor: 'pointer',
              }}
            >
              Tout d&eacute;cocher
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Page ──

export default function IssuesPage() {
  const [clientId, setClientId] = useState('');
  const [searchKey, setSearchKey] = useState('');
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [selectedAssignees, setSelectedAssignees] = useState<string[]>([]);
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [page, setPage] = useState(1);

  const { data: clients } = useQuery({ queryKey: ['clients'], queryFn: () => clientsApi.list() });
  const { data: jiraUsers } = useQuery({ queryKey: ['jira-users-all'], queryFn: () => jiraUsersApi.list() });

  const params = {
    ...(clientId ? { clientId: Number(clientId) } : {}),
    ...(selectedStatuses.length > 0 ? { status: selectedStatuses.join(',') } : {}),
    ...(selectedTypes.length > 0 ? { issueType: selectedTypes.join(',') } : {}),
    ...(selectedAssignees.length > 0 ? { assigneeAccountId: selectedAssignees.join(',') } : {}),
    ...(searchKey.trim() ? { jiraKey: searchKey.trim() } : {}),
    ...(periodStart ? { periodStart } : {}),
    ...(periodEnd ? { periodEnd } : {}),
    page,
    limit: PAGE_SIZE,
  };

  const { data, isLoading, isError, isFetching } = useQuery({
    queryKey: ['issues', params],
    queryFn: () => issuesApi.list(params),
    placeholderData: (prev) => prev,
  });

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 1;
  const jiraUserList = jiraUsers ?? [];

  function resetFilters() {
    setClientId('');
    setSearchKey('');
    setSelectedStatuses([]);
    setSelectedTypes([]);
    setSelectedAssignees([]);
    setPeriodStart('');
    setPeriodEnd('');
    setPage(1);
  }

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111827', marginBottom: 20 }}>Issues</h1>

      {/* Filtres */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20, alignItems: 'flex-end' }}>
        <div>
          <label style={labelStyle}>Cl&eacute; Jira</label>
          <input
            type="text"
            value={searchKey}
            onChange={(e) => { setSearchKey(e.target.value); setPage(1); }}
            placeholder="Rechercher par cl&eacute; (ex: ISR-14106)"
            style={{ ...inputStyle, minWidth: 220 }}
          />
        </div>

        <div>
          <label style={labelStyle}>Client</label>
          <select value={clientId} onChange={(e) => { setClientId(e.target.value); setPage(1); }} style={inputStyle}>
            <option value="">Tous les clients</option>
            {clients?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        <div>
          <label style={labelStyle}>Assigne a</label>
          <MultiSelectDropdown
            options={jiraUserList.map((ju) => ({
              value: ju.jiraAccountId,
              label: ju.collaborator ? `${ju.collaborator.firstName} ${ju.collaborator.lastName}` : ju.displayName,
              sublabel: ju.collaborator?.email,
            }))}
            selected={selectedAssignees}
            onChange={(v) => { setSelectedAssignees(v); setPage(1); }}
            placeholder="Tous"
          />
        </div>

        <div>
          <label style={labelStyle}>Statut</label>
          <StatusFilter selected={selectedStatuses} onChange={(v) => { setSelectedStatuses(v); setPage(1); }} />
        </div>

        <div>
          <label style={labelStyle}>Type</label>
          <IssueTypeFilter selected={selectedTypes} onChange={(t) => { setSelectedTypes(t); setPage(1); }} />
        </div>

        <div>
          <label style={labelStyle}>Mis &agrave; jour depuis</label>
          <input type="date" value={periodStart} onChange={(e) => { setPeriodStart(e.target.value); setPage(1); }} style={inputStyle} />
        </div>

        <div>
          <label style={labelStyle}>Mis &agrave; jour jusqu'&agrave;</label>
          <input type="date" value={periodEnd} onChange={(e) => { setPeriodEnd(e.target.value); setPage(1); }} style={inputStyle} />
        </div>

        <button onClick={resetFilters} style={resetBtnStyle}>R&eacute;initialiser</button>
      </div>

      {/* Compteur */}
      <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 12 }}>
        {isError && <span style={{ color: '#b91c1c' }}>Erreur lors du chargement.</span>}
        {data && `${data.total.toLocaleString('fr-FR')} issue(s)`}
        {isFetching && !isLoading ? ' · chargement...' : ''}
      </div>

      {/* Tableau */}
      <div style={{ background: 'white', borderRadius: 8, border: '1px solid #e5e7eb', overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
              {['Clé', 'Client / Projet', 'Résumé', 'Type', 'Statut', 'Assigné',
                'Estimé', 'Passé', 'Estimé (rollup)', 'Passé (rollup)', 'Restant (rollup)', 'SP', 'Mis à jour',
              ].map((h) => (
                <th key={h} style={thStyle}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={13} style={emptyTdStyle}>Chargement...</td></tr>
            ) : isError ? (
              <tr><td colSpan={13} style={{ ...emptyTdStyle, color: '#b91c1c' }}>Erreur de chargement.</td></tr>
            ) : data?.data.length === 0 ? (
              <tr><td colSpan={13} style={emptyTdStyle}>Aucune issue trouvée.</td></tr>
            ) : (
              data?.data.map((issue) => {
                const hasChildren =
                  issue.rollupTimeSpentSeconds !== issue.timeSpentSeconds ||
                  (issue.rollupEstimateHours !== null && issue.rollupEstimateHours !== issue.originalEstimateHours);

                return (
                  <tr key={issue.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={tdStyle}>
                      <span style={{ fontFamily: 'monospace', color: '#4f94ef' }}>{issue.jiraKey}</span>
                    </td>
                    <td style={tdStyle}>
                      <div style={{ fontWeight: 500 }}>{issue.project.client.name}</div>
                      <div style={{ color: '#6b7280', fontSize: 12 }}>{issue.project.jiraProjectName}</div>
                    </td>
                    <td style={{ ...tdStyle, maxWidth: 300 }}>
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                           title={issue.summary}>{issue.summary}</div>
                    </td>
                    <td style={tdStyle}><span style={typeBadge(issue.issueType)}>{issue.issueType}</span></td>
                    <td style={tdStyle}><span style={statusBadge(issue.status)}>{issue.status}</span></td>
                    <td style={tdStyle}>
                      {issue.assigneeDisplayName
                        ? issue.assigneeDisplayName
                        : issue.assigneeJiraAccountId
                          ? <span style={{ color: '#6b7280', fontSize: 11, fontFamily: 'monospace' }}>{issue.assigneeJiraAccountId.slice(0, 14)}...</span>
                          : <span style={{ color: '#9ca3af' }}>\u2014</span>}
                    </td>
                    {/* Estimé propre */}
                    <td style={{ ...tdStyle, textAlign: 'right' }}>
                      {fmtHours(issue.originalEstimateHours)}
                    </td>
                    {/* Passé propre */}
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{fmt(issue.timeSpentSeconds)}</td>
                    {/* Estimé rollup */}
                    <td style={{ ...tdStyle, textAlign: 'right', fontWeight: hasChildren ? 600 : 400, color: hasChildren ? '#4338ca' : undefined }}>
                      {fmtHours(issue.rollupEstimateHours)}
                    </td>
                    {/* Passé rollup */}
                    <td style={{ ...tdStyle, textAlign: 'right', fontWeight: hasChildren ? 600 : 400, color: hasChildren ? '#4338ca' : undefined }}>
                      {fmtHours(issue.rollupTimeSpentHours)}
                    </td>
                    {/* Restant rollup */}
                    <td style={{ ...tdStyle, textAlign: 'right', color: '#9333ea' }}>
                      {fmtHours(issue.rollupRemainingHours)}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>
                      {issue.storyPoints !== null ? issue.storyPoints : '\u2014'}
                    </td>
                    <td style={{ ...tdStyle, color: '#6b7280', whiteSpace: 'nowrap' }}>
                      {new Date(issue.jiraUpdatedAt).toLocaleDateString('fr-FR')}
                    </td>
                  </tr>
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
            {'← Précédent'}
          </button>
          <span style={{ fontSize: 13, color: '#374151' }}>Page {page} / {totalPages}</span>
          <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} style={pageBtnStyle(page === totalPages)}>
            {'Suivant →'}
          </button>
        </div>
      )}
    </div>
  );
}

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
