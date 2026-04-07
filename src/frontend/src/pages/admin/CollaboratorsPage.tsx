import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { collaboratorsApi, profilesApi } from '@/api/endpoints';
import type { Collaborator } from '@/types';

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  ACTIF: { bg: '#d1fae5', color: '#065f46' },
  INACTIF: { bg: '#fef3c7', color: '#92400e' },
  EXCLU: { bg: '#fee2e2', color: '#b91c1c' },
};

export default function CollaboratorsPage() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [showCreate, setShowCreate] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearchQuery(searchInput);
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [searchInput]);

  const { data: collaborators, isLoading } = useQuery({
    queryKey: ['collaborators', searchQuery],
    queryFn: () => collaboratorsApi.list(searchQuery ? { search: searchQuery } : undefined),
  });
  const { data: profiles } = useQuery({ queryKey: ['profiles'], queryFn: profilesApi.list });

  const filtered = collaborators?.filter((c) => !statusFilter || c.status === statusFilter) ?? [];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111827', margin: 0 }}>Collaborateurs</h1>
        <button onClick={() => setShowCreate(true)} style={btnPrimary}>+ Ajouter</button>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder="Rechercher par nom..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, width: 220 }}
        />
        <div style={{ display: 'flex', gap: 8 }}>
        {['', 'ACTIF', 'INACTIF', 'EXCLU'].map((s) => (
          <button key={s} onClick={() => setStatusFilter(s)} style={{
            padding: '4px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
            border: statusFilter === s ? '2px solid #4f46e5' : '1px solid #d1d5db',
            background: statusFilter === s ? '#eef2ff' : 'white',
            color: statusFilter === s ? '#4f46e5' : '#374151',
          }}>
            {s || 'Tous'} {s && collaborators ? `(${collaborators.filter((c) => c.status === s).length})` : ''}
          </button>
        ))}
        </div>
      </div>

      {isLoading && <div style={{ color: '#6b7280', padding: 40 }}>Chargement...</div>}

      <div style={{ background: 'white', borderRadius: 8, border: '1px solid #e5e7eb', overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
              {['Nom', 'Email', 'Profil', 'Statut', 'Actions'].map((h) => (
                <th key={h} style={thStyle}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <tr key={c.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                <td style={{ ...tdStyle, fontWeight: 500 }}>{c.firstName} {c.lastName}</td>
                <td style={tdStyle}>{c.email}</td>
                <td style={tdStyle}>
                  <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, background: '#ede9fe', color: '#5b21b6' }}>
                    {c.profile?.label ?? '—'}
                  </span>
                </td>
                <td style={tdStyle}>
                  <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, ...(STATUS_COLORS[c.status] ?? { bg: '#f3f4f6', color: '#374151' }) }}>
                    {c.status}
                  </span>
                </td>
                <td style={tdStyle}>
                  <button onClick={() => setEditId(c.id)} style={btnSmall}>Modifier</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && !isLoading && (
          <div style={{ padding: 32, textAlign: 'center', color: '#6b7280' }}>Aucun collaborateur.</div>
        )}
      </div>

      {showCreate && profiles && (
        <CollabModal profiles={profiles} onClose={() => setShowCreate(false)}
          onSaved={() => { queryClient.invalidateQueries({ queryKey: ['collaborators'] }); setShowCreate(false); }} />
      )}
      {editId && profiles && collaborators && (
        <CollabModal collaborator={collaborators.find((c) => c.id === editId)} profiles={profiles}
          onClose={() => setEditId(null)}
          onSaved={() => { queryClient.invalidateQueries({ queryKey: ['collaborators'] }); setEditId(null); }} />
      )}
    </div>
  );
}

function CollabModal({ collaborator, profiles, onClose, onSaved }: {
  collaborator?: Collaborator;
  profiles: Array<{ id: number; code: string; label: string }>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const defaultProfileId = collaborator?.profileId ?? profiles.find((p) => p.code === 'VIEWER')?.id ?? profiles[0]?.id ?? 0;
  const [email, setEmail] = useState(collaborator?.email ?? '');
  const [firstName, setFirstName] = useState(collaborator?.firstName ?? '');
  const [lastName, setLastName] = useState(collaborator?.lastName ?? '');
  const [profileId, setProfileId] = useState(defaultProfileId);
  const [status, setStatus] = useState(collaborator?.status ?? 'ACTIF');

  const mutation = useMutation({
    mutationFn: () => {
      if (collaborator) {
        return collaboratorsApi.update(collaborator.id, { firstName, lastName, email, profileId, status } as Partial<Collaborator>);
      }
      return collaboratorsApi.create({ email, firstName, lastName, profileId });
    },
    onSuccess: onSaved,
  });

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300 }} onClick={onClose}>
      <div style={{ background: 'white', borderRadius: 10, padding: 24, width: 440, maxWidth: '95vw' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
            {collaborator ? `Modifier ${collaborator.firstName} ${collaborator.lastName}` : 'Nouveau collaborateur'}
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#6b7280' }}>{'×'}</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={labelStyle}>Email {collaborator ? '' : '*'}</label>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={!!collaborator}
              style={{ ...inputStyle, ...(collaborator ? { background: '#f3f4f6', color: '#6b7280' } : {}) }}
            />
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Prenom</label>
              <input value={firstName} onChange={(e) => setFirstName(e.target.value)} style={inputStyle} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Nom</label>
              <input value={lastName} onChange={(e) => setLastName(e.target.value)} style={inputStyle} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Profil</label>
              <select value={profileId} onChange={(e) => setProfileId(Number(e.target.value))} style={inputStyle}>
                {profiles.filter((p) => p.isActive !== false).map((p) => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </select>
            </div>
            {collaborator && (
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Statut</label>
                <select value={status} onChange={(e) => setStatus(e.target.value as Collaborator['status'])} style={inputStyle}>
                  <option value="ACTIF">Actif</option>
                  <option value="INACTIF">Inactif</option>
                  <option value="EXCLU">Exclu</option>
                </select>
              </div>
            )}
          </div>
          <button onClick={() => mutation.mutate()} disabled={mutation.isPending || (!collaborator && !email)} style={btnPrimary}>
            {mutation.isPending ? 'Enregistrement...' : collaborator ? 'Sauvegarder' : 'Creer'}
          </button>
        </div>
      </div>
    </div>
  );
}

const thStyle: React.CSSProperties = { padding: '10px 16px', textAlign: 'left', fontSize: 12, color: '#6b7280', fontWeight: 600 };
const tdStyle: React.CSSProperties = { padding: '10px 16px' };
const labelStyle: React.CSSProperties = { display: 'block', fontSize: 12, color: '#6b7280', marginBottom: 4 };
const inputStyle: React.CSSProperties = { width: '100%', padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' as const };
const btnPrimary: React.CSSProperties = { padding: '8px 20px', background: '#4f46e5', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600 };
const btnSmall: React.CSSProperties = { padding: '3px 10px', background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: 5, cursor: 'pointer', fontSize: 12 };
