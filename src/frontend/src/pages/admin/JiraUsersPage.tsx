import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { jiraUsersApi, collaboratorsApi, clientsApi } from '@/api/endpoints';

export default function JiraUsersPage() {
  const queryClient = useQueryClient();
  const [clientFilter, setClientFilter] = useState<string>('');
  const [linkFilter, setLinkFilter] = useState<'all' | 'linked' | 'unlinked'>('all');

  const { data: clients } = useQuery({ queryKey: ['clients'], queryFn: clientsApi.list });
  const { data: jiraUsers, isLoading } = useQuery({
    queryKey: ['jira-users', clientFilter],
    queryFn: () => jiraUsersApi.list(clientFilter ? Number(clientFilter) : undefined),
  });
  const { data: collaborators } = useQuery({
    queryKey: ['collaborators'],
    queryFn: () => collaboratorsApi.list(),
  });

  const linkMutation = useMutation({
    mutationFn: ({ id, collaboratorId }: { id: number; collaboratorId: number | null }) =>
      jiraUsersApi.linkToCollaborator(id, collaboratorId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['jira-users'] }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Parameters<typeof jiraUsersApi.update>[1] }) =>
      jiraUsersApi.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['jira-users'] }),
  });

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<{ displayName: string; emailAddress: string }>({ displayName: '', emailAddress: '' });

  const filtered = (jiraUsers ?? []).filter((ju) => {
    if (linkFilter === 'linked' && !ju.collaboratorId) return false;
    if (linkFilter === 'unlinked' && ju.collaboratorId) return false;
    return true;
  });

  const unlinkedCount = (jiraUsers ?? []).filter((ju) => !ju.collaboratorId).length;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111827', margin: 0 }}>
          Utilisateurs JIRA
          {unlinkedCount > 0 && (
            <span style={{ marginLeft: 12, padding: '2px 10px', borderRadius: 999, background: '#fef3c7', color: '#92400e', fontSize: 13, fontWeight: 600 }}>
              {unlinkedCount} non rattaché{unlinkedCount > 1 ? 's' : ''}
            </span>
          )}
        </h1>
      </div>

      {/* Filtres */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div>
          <label style={labelStyle}>Client</label>
          <select value={clientFilter} onChange={(e) => setClientFilter(e.target.value)} style={inputStyle}>
            <option value="">Tous les clients</option>
            {clients?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {(['all', 'linked', 'unlinked'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setLinkFilter(f)}
              style={{
                padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                border: linkFilter === f ? '2px solid #4f46e5' : '1px solid #d1d5db',
                background: linkFilter === f ? '#eef2ff' : 'white',
                color: linkFilter === f ? '#4f46e5' : '#374151',
              }}
            >
              {f === 'all' ? 'Tous' : f === 'linked' ? 'Rattachés' : 'Non rattachés'}
            </button>
          ))}
        </div>
      </div>

      {isLoading && <div style={{ color: '#6b7280', padding: 40 }}>Chargement...</div>}

      <div style={{ background: 'white', borderRadius: 8, border: '1px solid #e5e7eb', overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
              {['Display Name', 'Account ID', 'Email JIRA', 'Instance', 'Actif', 'Collaborateur rattaché', ''].map((h) => (
                <th key={h} style={thStyle}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((ju) => {
              const isEditing = editingId === ju.id;
              return (
              <tr key={ju.id} style={{ borderBottom: '1px solid #f3f4f6', background: isEditing ? '#fefce8' : undefined }}>
                <td style={{ ...tdStyle, fontWeight: 500 }}>
                  {isEditing ? (
                    <input value={editForm.displayName} onChange={(e) => setEditForm((f) => ({ ...f, displayName: e.target.value }))}
                      style={{ ...inputStyle, width: '100%', fontWeight: 500 }} />
                  ) : ju.displayName}
                </td>
                <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: 11, color: '#6b7280' }}>
                  {ju.jiraAccountId.slice(0, 20)}...
                </td>
                <td style={tdStyle}>
                  {isEditing ? (
                    <input value={editForm.emailAddress} onChange={(e) => setEditForm((f) => ({ ...f, emailAddress: e.target.value }))}
                      style={{ ...inputStyle, width: '100%' }} placeholder="email" />
                  ) : (ju.emailAddress || <span style={{ color: '#9ca3af' }}>—</span>)}
                </td>
                <td style={tdStyle}>
                  <span style={{ fontSize: 11, color: '#6b7280' }}>
                    {ju.jiraConnection?.name ?? `#${ju.jiraConnectionId}`}
                  </span>
                </td>
                <td style={{ ...tdStyle, textAlign: 'center' }}>
                  <button
                    onClick={() => updateMutation.mutate({ id: ju.id, data: { isActive: !ju.isActive } })}
                    disabled={updateMutation.isPending}
                    style={{
                      width: 36, height: 20, borderRadius: 10, border: 'none', cursor: 'pointer',
                      background: ju.isActive ? '#22c55e' : '#d1d5db', position: 'relative',
                      transition: 'background 0.2s',
                    }}
                    title={ju.isActive ? 'Desactiver' : 'Activer'}
                  >
                    <span style={{
                      width: 16, height: 16, borderRadius: '50%', background: 'white',
                      position: 'absolute', top: 2,
                      left: ju.isActive ? 18 : 2,
                      transition: 'left 0.2s',
                    }} />
                  </button>
                </td>
                <td style={tdStyle}>
                  <select
                    value={ju.collaboratorId ?? ''}
                    onChange={(e) => {
                      const val = e.target.value ? Number(e.target.value) : null;
                      linkMutation.mutate({ id: ju.id, collaboratorId: val });
                    }}
                    style={{
                      ...inputStyle,
                      minWidth: 200,
                      background: ju.collaboratorId ? '#f0fdf4' : '#fef3c7',
                      borderColor: ju.collaboratorId ? '#bbf7d0' : '#fde68a',
                    }}
                  >
                    <option value="">— Non rattache —</option>
                    {(collaborators ?? [])
                      .filter((c: { status: string }) => c.status !== 'EXCLU')
                      .map((c: { id: number; firstName: string; lastName: string; email: string }) => (
                        <option key={c.id} value={c.id}>{c.firstName} {c.lastName} ({c.email})</option>
                      ))}
                  </select>
                </td>
                <td style={tdStyle}>
                  {isEditing ? (
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button
                        onClick={() => {
                          updateMutation.mutate({ id: ju.id, data: {
                            displayName: editForm.displayName,
                            emailAddress: editForm.emailAddress || null,
                          }});
                          setEditingId(null);
                        }}
                        style={{ padding: '3px 10px', background: '#4f94ef', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}
                      >OK</button>
                      <button
                        onClick={() => setEditingId(null)}
                        style={{ padding: '3px 10px', background: 'white', border: '1px solid #d1d5db', borderRadius: 4, cursor: 'pointer', fontSize: 11 }}
                      >Annuler</button>
                    </div>
                  ) : (
                    <button
                      onClick={() => { setEditingId(ju.id); setEditForm({ displayName: ju.displayName, emailAddress: ju.emailAddress ?? '' }); }}
                      style={{ padding: '3px 10px', background: 'white', border: '1px solid #d1d5db', borderRadius: 4, cursor: 'pointer', fontSize: 11, color: '#374151' }}
                    >Modifier</button>
                  )}
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && !isLoading && (
          <div style={{ padding: 32, textAlign: 'center', color: '#6b7280' }}>Aucun utilisateur JIRA.</div>
        )}
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = { display: 'block', fontSize: 12, color: '#6b7280', marginBottom: 4 };
const inputStyle: React.CSSProperties = { padding: '5px 8px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13 };
const thStyle: React.CSSProperties = { padding: '10px 16px', textAlign: 'left', fontSize: 12, color: '#6b7280', fontWeight: 600, whiteSpace: 'nowrap' };
const tdStyle: React.CSSProperties = { padding: '8px 16px' };
