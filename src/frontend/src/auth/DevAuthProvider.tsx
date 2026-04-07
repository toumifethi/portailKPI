/**
 * AuthProvider mode dev : affiche un ecran de selection de collaborateur
 * pour simuler differents profils.
 */
import React, { useEffect, useState } from 'react';
import { useAppStore, CurrentUser } from '@/store/appStore';
import { apiClient } from '@/api/client';

interface DevUser {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  profile: { id: number; code: string; label: string };
}

const PROFILE_COLORS: Record<string, string> = {
  ADMIN: '#7c3aed',
  DELIVERY_MANAGER: '#2563eb',
  CHEF_DE_PROJET: '#059669',
  DEVELOPPEUR: '#d97706',
  VIEWER: '#6b7280',
};

export function DevAuthProvider({ children }: { children: React.ReactNode }) {
  const { currentUser, setCurrentUser } = useAppStore();
  const [users, setUsers] = useState<DevUser[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiClient.get<DevUser[]>('/auth/dev-users')
      .then((r) => setUsers(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function selectUser(user: DevUser) {
    setCurrentUser({
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      profile: user.profile,
    });
  }

  function logout() {
    setCurrentUser(null);
  }

  // Si un utilisateur est deja selectionne, afficher l'app
  if (currentUser) {
    return (
      <DevSessionContext.Provider value={{ currentUser, logout }}>
        {children}
      </DevSessionContext.Provider>
    );
  }

  // Sinon afficher l'ecran de selection
  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 520, maxWidth: '95vw' }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>🎯</div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#111827', margin: 0 }}>Portail KPI</h1>
          <p style={{ fontSize: 14, color: '#6b7280', marginTop: 4 }}>Mode developpement — choisissez un profil</p>
        </div>

        {loading && <div style={{ textAlign: 'center', color: '#6b7280' }}>Chargement...</div>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {/* Grouper par profil */}
          {groupByProfile(users).map(([profileLabel, profileCode, profileUsers]) => (
            <div key={profileCode}>
              <div style={{
                fontSize: 11, fontWeight: 700, color: PROFILE_COLORS[profileCode] ?? '#6b7280',
                textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4, marginTop: 8,
              }}>
                {profileLabel}
              </div>
              {profileUsers.map((user) => (
                <button
                  key={user.id}
                  onClick={() => selectUser(user)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12, width: '100%',
                    padding: '12px 16px', marginBottom: 4,
                    background: 'white', border: '1px solid #e5e7eb', borderRadius: 8,
                    cursor: 'pointer', textAlign: 'left',
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.borderColor = PROFILE_COLORS[profileCode] ?? '#6b7280';
                    (e.currentTarget as HTMLElement).style.background = '#f8fafc';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.borderColor = '#e5e7eb';
                    (e.currentTarget as HTMLElement).style.background = 'white';
                  }}
                >
                  <div style={{
                    width: 36, height: 36, borderRadius: '50%',
                    background: PROFILE_COLORS[profileCode] ?? '#6b7280',
                    color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 14, fontWeight: 700,
                  }}>
                    {user.firstName[0]}{user.lastName[0]}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, color: '#111827' }}>
                      {user.firstName} {user.lastName}
                    </div>
                    <div style={{ fontSize: 12, color: '#6b7280' }}>{user.email}</div>
                  </div>
                  <span style={{
                    padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 600,
                    background: `${PROFILE_COLORS[profileCode] ?? '#6b7280'}15`,
                    color: PROFILE_COLORS[profileCode] ?? '#6b7280',
                  }}>
                    {user.profile.label}
                  </span>
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function groupByProfile(users: DevUser[]): Array<[string, string, DevUser[]]> {
  const groups = new Map<string, { label: string; users: DevUser[] }>();
  for (const u of users) {
    const key = u.profile.code;
    if (!groups.has(key)) groups.set(key, { label: u.profile.label, users: [] });
    groups.get(key)!.users.push(u);
  }
  return [...groups.entries()].map(([code, g]) => [g.label, code, g.users]);
}

// Context pour le logout
interface DevSession {
  currentUser: CurrentUser;
  logout: () => void;
}

const DevSessionContext = React.createContext<DevSession>({
  currentUser: { id: 0, email: '', firstName: '', lastName: '', profile: { id: 0, code: '', label: '' } },
  logout: () => {},
});

export function useDevSession(): DevSession {
  return React.useContext(DevSessionContext);
}
