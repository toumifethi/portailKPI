import { useQuery } from '@tanstack/react-query';
import { useAppStore } from '@/store/appStore';
import { clientsApi } from '@/api/endpoints';
import { PeriodSelector } from '@/components/shared/PeriodSelector';

const IS_DEV_AUTH = import.meta.env.VITE_AUTH_MODE === 'dev';

const DEV_ROLE_LABELS: Record<string, string> = {
  ADMIN:   'Administrateur',
  DM:      'Delivery Manager',
  MANAGER: 'Manager',
  VIEWER:  'Lecteur',
};

function useAuthInfo() {
  if (IS_DEV_AUTH) {
    return { displayName: null, logout: () => {} };
  }
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { useMsal } = require('@azure/msal-react') as { useMsal: () => { accounts: Array<{ name?: string; username?: string }>; instance: { logoutRedirect: () => void } } };
  const { accounts, instance } = useMsal();
  return {
    displayName: accounts[0]?.name ?? accounts[0]?.username ?? '',
    logout: () => instance.logoutRedirect(),
  };
}

export function Header() {
  const { displayName, logout } = useAuthInfo();
  const { selectedClientId, setSelectedClientId, clients, setClients } = useAppStore();

  const { data: clientList } = useQuery({
    queryKey: ['clients'],
    queryFn: async () => {
      const data = await clientsApi.list();
      setClients(data);
      return data;
    },
  });

  // Profil dev lu depuis la variable d'environnement Vite (définie dans docker-compose.dev.yml)
  const devProfile = IS_DEV_AUTH
    ? (import.meta.env.VITE_DEV_PROFILE as string | undefined) ?? 'ADMIN'
    : null;

  return (
    <header
      style={{
        height: 64,
        background: '#ffffff',
        borderBottom: '1px solid #e5e7eb',
        display: 'flex',
        alignItems: 'center',
        padding: '0 24px',
        gap: 16,
      }}
    >
      {/* Sélecteur de client */}
      <select
        value={selectedClientId ?? ''}
        onChange={(e) => setSelectedClientId(e.target.value ? Number(e.target.value) : null)}
        style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 14, minWidth: 180 }}
      >
        <option value="">— Sélectionner un client —</option>
        {(clientList ?? clients).map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>

      {/* Sélecteur de période */}
      <PeriodSelector />

      <div style={{ flex: 1 }} />

      {/* Badge DEV + profil actif (mode développement uniquement) */}
      {IS_DEV_AUTH && devProfile && (
        <div
          style={{ display: 'flex', alignItems: 'center', gap: 8 }}
          title="Profil défini par VITE_DEV_PROFILE dans docker-compose.dev.yml"
        >
          <span style={{
            background: '#fef3c7', color: '#92400e',
            fontSize: 11, fontWeight: 700,
            padding: '2px 7px', borderRadius: 4,
            letterSpacing: '0.05em',
          }}>
            DEV
          </span>
          <span style={{ fontSize: 13, color: '#92400e', fontWeight: 600 }}>
            {DEV_ROLE_LABELS[devProfile] ?? devProfile}
          </span>
        </div>
      )}

      {/* Nom utilisateur (prod uniquement) */}
      {!IS_DEV_AUTH && displayName && (
        <span style={{ fontSize: 14, color: '#6b7280' }}>{displayName}</span>
      )}

      {/* Bouton déconnexion */}
      <button
        onClick={IS_DEV_AUTH ? undefined : logout}
        disabled={IS_DEV_AUTH}
        title={IS_DEV_AUTH ? 'Non disponible en mode dev' : undefined}
        style={{
          padding: '6px 14px',
          border: '1px solid #d1d5db',
          borderRadius: 6,
          background: 'white',
          cursor: IS_DEV_AUTH ? 'not-allowed' : 'pointer',
          fontSize: 13,
          color: IS_DEV_AUTH ? '#d1d5db' : '#374151',
        }}
      >
        Déconnexion
      </button>
    </header>
  );
}
