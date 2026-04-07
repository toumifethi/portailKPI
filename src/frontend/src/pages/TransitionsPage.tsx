import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { transitionsApi, clientsApi, jiraUsersApi, issuesApi } from '@/api/endpoints';
import { MultiSelectDropdown } from '@/components/shared/MultiSelectDropdown';

const PAGE_SIZE = 50;

export default function TransitionsPage() {
  const [clientId, setClientId] = useState('');
  const [searchKey, setSearchKey] = useState('');
  const [selectedFromStatuses, setSelectedFromStatuses] = useState<string[]>([]);
  const [selectedToStatuses, setSelectedToStatuses] = useState<string[]>([]);
  const [selectedAssignees, setSelectedAssignees] = useState<string[]>([]);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [page, setPage] = useState(1);

  const { data: clients } = useQuery({ queryKey: ['clients'], queryFn: clientsApi.list });
  const { data: jiraUsers } = useQuery({ queryKey: ['jira-users-all'], queryFn: () => jiraUsersApi.list() });
  const { data: issueTypes } = useQuery({ queryKey: ['issueTypes'], queryFn: issuesApi.listTypes, staleTime: 60_000 });

  const cid = clientId ? Number(clientId) : undefined;
  const { data: statusData } = useQuery({
    queryKey: ['transition-statuses', cid],
    queryFn: () => transitionsApi.statuses(cid),
    staleTime: 60_000,
  });

  const params = {
    ...(clientId ? { clientId: Number(clientId) } : {}),
    ...(searchKey.trim() ? { jiraKey: searchKey.trim() } : {}),
    ...(selectedFromStatuses.length > 0 ? { fromStatus: selectedFromStatuses.join(',') } : {}),
    ...(selectedToStatuses.length > 0 ? { toStatus: selectedToStatuses.join(',') } : {}),
    ...(selectedAssignees.length > 0 ? { assignee: selectedAssignees.join(',') } : {}),
    ...(selectedTypes.length > 0 ? { issueType: selectedTypes.join(',') } : {}),
    ...(periodStart ? { periodStart } : {}),
    ...(periodEnd ? { periodEnd } : {}),
    page,
    limit: PAGE_SIZE,
  };

  const { data, isLoading, isError, isFetching } = useQuery({
    queryKey: ['transitions', params],
    queryFn: () => transitionsApi.list(params),
    placeholderData: (prev) => prev,
  });

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 1;
  const jiraUserList = jiraUsers ?? [];

  function resetFilters() {
    setClientId('');
    setSearchKey('');
    setSelectedFromStatuses([]);
    setSelectedToStatuses([]);
    setSelectedAssignees([]);
    setSelectedTypes([]);
    setPeriodStart('');
    setPeriodEnd('');
    setPage(1);
  }

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111827', marginBottom: 20 }}>
        Transitions de statut
      </h1>

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
          <label style={labelStyle}>Cle Jira</label>
          <input
            type="text"
            value={searchKey}
            onChange={(e) => { setSearchKey(e.target.value); setPage(1); }}
            placeholder="Ex: PROJ-123"
            style={{ ...inputStyle, minWidth: 160 }}
          />
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
          <label style={labelStyle}>De (statut)</label>
          <MultiSelectDropdown
            options={(statusData?.fromStatuses ?? []).map((s) => ({ value: s, label: s }))}
            selected={selectedFromStatuses}
            onChange={(v) => { setSelectedFromStatuses(v); setPage(1); }}
            placeholder="Tous"
          />
        </div>

        <div>
          <label style={labelStyle}>Vers (statut)</label>
          <MultiSelectDropdown
            options={(statusData?.toStatuses ?? []).map((s) => ({ value: s, label: s }))}
            selected={selectedToStatuses}
            onChange={(v) => { setSelectedToStatuses(v); setPage(1); }}
            placeholder="Tous"
          />
        </div>

        <div>
          <label style={labelStyle}>Type</label>
          <MultiSelectDropdown
            options={(issueTypes ?? []).map((t) => ({ value: t, label: t }))}
            selected={selectedTypes}
            onChange={(v) => { setSelectedTypes(v); setPage(1); }}
            placeholder="Tous les types"
          />
        </div>

        <div>
          <label style={labelStyle}>Depuis</label>
          <input type="date" value={periodStart} onChange={(e) => { setPeriodStart(e.target.value); setPage(1); }} style={inputStyle} />
        </div>

        <div>
          <label style={labelStyle}>Jusqu'au</label>
          <input type="date" value={periodEnd} onChange={(e) => { setPeriodEnd(e.target.value); setPage(1); }} style={inputStyle} />
        </div>

        <button onClick={resetFilters} style={resetBtnStyle}>Reinitialiser</button>
      </div>

      {/* Compteur */}
      <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 12 }}>
        {isError && <span style={{ color: '#b91c1c' }}>Erreur lors du chargement.</span>}
        {data && `${data.total.toLocaleString('fr-FR')} transition(s)`}
        {isFetching && !isLoading ? ' · chargement...' : ''}
      </div>

      {/* Tableau */}
      <div style={{ background: 'white', borderRadius: 8, border: '1px solid #e5e7eb', overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
              {['Cle', 'Client / Projet', 'Resume', 'Type', 'Assigne', 'De', 'Vers', 'Date'].map((h) => (
                <th key={h} style={thStyle}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={8} style={emptyTdStyle}>Chargement...</td></tr>
            ) : isError ? (
              <tr><td colSpan={8} style={{ ...emptyTdStyle, color: '#b91c1c' }}>Erreur de chargement.</td></tr>
            ) : data?.data.length === 0 ? (
              <tr><td colSpan={8} style={emptyTdStyle}>Aucune transition trouvee.</td></tr>
            ) : (
              data?.data.map((t) => (
                <tr key={t.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={tdStyle}>
                    <span style={{ fontFamily: 'monospace', color: '#4f94ef' }}>{t.jiraKey}</span>
                  </td>
                  <td style={tdStyle}>
                    <div style={{ fontWeight: 500 }}>{t.clientName}</div>
                    <div style={{ color: '#6b7280', fontSize: 12 }}>{t.projectName}</div>
                  </td>
                  <td style={{ ...tdStyle, maxWidth: 300 }}>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                         title={t.summary}>{t.summary}</div>
                  </td>
                  <td style={tdStyle}><span style={typeBadge(t.issueType)}>{t.issueType}</span></td>
                  <td style={tdStyle}>
                    {t.assigneeDisplayName
                      ? t.assigneeDisplayName
                      : <span style={{ color: '#9ca3af' }}>{'\u2014'}</span>}
                  </td>
                  <td style={tdStyle}>
                    <span style={statusBadge(t.fromStatus)}>{t.fromStatus ?? '\u2014'}</span>
                  </td>
                  <td style={tdStyle}>
                    <span style={statusBadge(t.toStatus)}>{t.toStatus}</span>
                  </td>
                  <td style={{ ...tdStyle, color: '#6b7280', whiteSpace: 'nowrap' }}>
                    {new Date(t.changedAt).toLocaleDateString('fr-FR')}{' '}
                    <span style={{ fontSize: 11 }}>
                      {new Date(t.changedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                    </span>
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
            {'\u2190 Precedent'}
          </button>
          <span style={{ fontSize: 13, color: '#374151' }}>Page {page} / {totalPages}</span>
          <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} style={pageBtnStyle(page === totalPages)}>
            {'Suivant \u2192'}
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

function statusBadge(status: string | null): React.CSSProperties {
  if (!status) return { padding: '2px 7px', borderRadius: 4, fontSize: 11, background: '#f3f4f6', color: '#9ca3af' };
  const s = status.toLowerCase();
  if (s.includes('done') || s.includes('closed') || s.includes('resolved'))
    return { padding: '2px 7px', borderRadius: 4, fontSize: 11, background: '#d1fae5', color: '#065f46' };
  if (s.includes('progress') || s.includes('review'))
    return { padding: '2px 7px', borderRadius: 4, fontSize: 11, background: '#dbeafe', color: '#1d4ed8' };
  return { padding: '2px 7px', borderRadius: 4, fontSize: 11, background: '#f3f4f6', color: '#374151' };
}
