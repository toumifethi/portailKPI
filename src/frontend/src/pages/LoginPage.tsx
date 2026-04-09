import { useMsal } from '@azure/msal-react';
import { loginRequest } from '@/auth/msalConfig';

export default function LoginPage() {
  const { instance } = useMsal();

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f3f4f6',
      }}
    >
      <div
        style={{
          background: 'white',
          borderRadius: 12,
          padding: '48px 40px',
          maxWidth: 400,
          width: '100%',
          textAlign: 'center',
          boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
        }}
      >
        <div style={{ fontSize: 48, marginBottom: 16 }}>🎯</div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111827', margin: '0 0 8px' }}>
          Portail KPI Productivité
        </h1>
        <p style={{ color: '#6b7280', fontSize: 14, margin: '0 0 32px' }}>
          Accédez à vos KPI développeur et PM via votre compte Azure AD DECADE.
        </p>

        <button
          onClick={() => instance.loginRedirect(loginRequest)}
          style={{
            width: '100%',
            padding: '12px 24px',
            background: '#0078d4',
            color: 'white',
            border: 'none',
            borderRadius: 8,
            fontSize: 15,
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
          }}
        >
          <span>🔐</span>
          <span>Connexion avec Microsoft</span>
        </button>

        <p style={{ marginTop: 24, fontSize: 12, color: '#9ca3af' }}>
          DECADE — Usage interne uniquement
        </p>
      </div>
    </div>
  );
}
