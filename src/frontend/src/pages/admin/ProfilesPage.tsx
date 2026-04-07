import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { profilesApi } from '@/api/endpoints';
import type { ProfileRef } from '@/types';

export default function ProfilesPage() {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);

  const { data: profiles, isLoading } = useQuery({
    queryKey: ['profiles'],
    queryFn: profilesApi.list,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => profilesApi.remove(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['profiles'] }),
  });

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111827', margin: 0 }}>Profils</h1>
          <p style={{ fontSize: 13, color: '#6b7280', margin: '4px 0 0' }}>
            Gerez les profils utilisateurs. Le code est utilise pour les droits d'acces, le libelle est affiche dans l'interface.
          </p>
        </div>
        <button onClick={() => setShowCreate(true)} style={btnPrimary}>+ Ajouter un profil</button>
      </div>

      {isLoading && <div style={{ color: '#6b7280', padding: 40 }}>Chargement...</div>}

      <div style={{ background: 'white', borderRadius: 8, border: '1px solid #e5e7eb', overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
              {['Code', 'Libelle', 'Description', 'Niveau', 'Actif', 'Actions'].map((h) => (
                <th key={h} style={thStyle}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {profiles?.map((p) => (
              <tr key={p.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                <td style={{ ...tdStyle, fontFamily: 'monospace', fontWeight: 600 }}>{p.code}</td>
                <td style={{ ...tdStyle, fontWeight: 500 }}>{p.label}</td>
                <td style={{ ...tdStyle, color: '#6b7280', fontSize: 12 }}>{p.description || '—'}</td>
                <td style={{ ...tdStyle, textAlign: 'center' }}>
                  <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, background: '#ede9fe', color: '#5b21b6' }}>
                    {p.level}
                  </span>
                </td>
                <td style={tdStyle}>
                  <span style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: p.isActive ? '#22c55e' : '#d1d5db',
                    display: 'inline-block',
                  }} />
                </td>
                <td style={{ ...tdStyle, display: 'flex', gap: 6 }}>
                  <button onClick={() => setEditId(p.id)} style={btnSmall}>Modifier</button>
                  <button
                    onClick={() => {
                      if (confirm(`Supprimer le profil "${p.label}" ? Impossible si des collaborateurs y sont rattaches.`)) {
                        deleteMutation.mutate(p.id);
                      }
                    }}
                    style={{ ...btnSmall, color: '#b91c1c', borderColor: '#fca5a5' }}
                  >
                    Supprimer
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {deleteMutation.isError && (
        <div style={{ marginTop: 12, padding: 10, background: '#fee2e2', borderRadius: 6, color: '#b91c1c', fontSize: 13 }}>
          Erreur : ce profil est probablement utilise par des collaborateurs.
        </div>
      )}

      {showCreate && <ProfileModal onClose={() => setShowCreate(false)} />}
      {editId && profiles && (
        <ProfileModal profile={profiles.find((p) => p.id === editId)} onClose={() => setEditId(null)} />
      )}
    </div>
  );
}

function ProfileModal({ profile, onClose }: { profile?: ProfileRef; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [code, setCode] = useState(profile?.code ?? '');
  const [label, setLabel] = useState(profile?.label ?? '');
  const [description, setDescription] = useState(profile?.description ?? '');
  const [level, setLevel] = useState(String(profile?.level ?? 0));
  const [isActive, setIsActive] = useState(profile?.isActive ?? true);

  const mutation = useMutation({
    mutationFn: () => {
      if (profile) {
        return profilesApi.update(profile.id, { label, description, level: Number(level), isActive });
      }
      return profilesApi.create({ code: code.toUpperCase(), label, description, level: Number(level) });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profiles'] });
      onClose();
    },
  });

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300 }} onClick={onClose}>
      <div style={{ background: 'white', borderRadius: 10, padding: 24, width: 440, maxWidth: '95vw' }} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700 }}>
          {profile ? `Modifier "${profile.label}"` : 'Nouveau profil'}
        </h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={labelStyle}>Code *</label>
            <input value={code} onChange={(e) => setCode(e.target.value)} disabled={!!profile}
              placeholder="ex: TECH_LEAD" style={{ ...inputStyle, fontFamily: 'monospace', ...(profile ? { background: '#f3f4f6' } : {}) }} />
            {!profile && <p style={{ margin: '2px 0 0', fontSize: 11, color: '#9ca3af' }}>Identifiant technique, non modifiable apres creation.</p>}
          </div>
          <div>
            <label style={labelStyle}>Libelle *</label>
            <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="ex: Tech Lead" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Description</label>
            <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description du profil" style={inputStyle} />
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Niveau (ordre de priorite)</label>
              <input type="number" value={level} onChange={(e) => setLevel(e.target.value)} style={inputStyle} />
              <p style={{ margin: '2px 0 0', fontSize: 11, color: '#9ca3af' }}>Plus le niveau est eleve, plus le profil a de droits.</p>
            </div>
            {profile && (
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Actif</label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer', marginTop: 6 }}>
                  <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
                  {isActive ? 'Actif' : 'Inactif'}
                </label>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={onClose} style={btnSecondary}>Annuler</button>
            <button onClick={() => mutation.mutate()} disabled={!code || !label || mutation.isPending} style={btnPrimary}>
              {mutation.isPending ? 'Enregistrement...' : profile ? 'Sauvegarder' : 'Creer'}
            </button>
          </div>
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
const btnSecondary: React.CSSProperties = { padding: '8px 20px', background: 'white', border: '1px solid #d1d5db', borderRadius: 6, cursor: 'pointer', fontSize: 13 };
const btnSmall: React.CSSProperties = { padding: '3px 10px', background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: 5, cursor: 'pointer', fontSize: 12 };
