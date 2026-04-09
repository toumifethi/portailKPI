import { NavLink } from 'react-router-dom';
import { useAppStore } from '@/store/appStore';

// minLevel = niveau minimum du profil pour voir cet item (0 = tous)
const NAV_ITEMS = [
  { path: '/dashboard', label: 'Tableau de bord', icon: '📊', minLevel: 0 },
  { path: '/evolution', label: 'Evolution', icon: '📈', minLevel: 0 },
  { path: '/cross-client', label: 'Vue cross-client', icon: '🌐', minLevel: 80 },
  { path: '/collaborateurs', label: 'KPI Collaborateurs', icon: '👤', minLevel: 60 },
  { path: '/issues', label: 'Issues', icon: '🎫', minLevel: 40 },
  { path: '/worklogs', label: 'Worklogs', icon: '⏱️', minLevel: 40 },
  { path: '/issue-links', label: 'Analyse des liens', icon: '🔗', minLevel: 60 },
  { path: '/transitions', label: 'Transitions', icon: '\u21C4', minLevel: 40 },
  { section: 'Administration', minLevel: 60 },
  { path: '/admin/clients', label: 'Clients', icon: '🏢', minLevel: 100 },
  { path: '/admin/jira-connections', label: 'Connexions JIRA', icon: '🔌', minLevel: 100 },
  { path: '/admin/collaborators', label: 'Collaborateurs', icon: '👥', minLevel: 100 },
  { path: '/admin/jira-users', label: 'Utilisateurs JIRA', icon: '🔗', minLevel: 100 },
  { path: '/admin/profiles', label: 'Profils', icon: '🛡️', minLevel: 100 },
  { path: '/admin/scheduling', label: 'Planification', icon: '⏰', minLevel: 100 },
  { path: '/admin/kpi-config', label: 'Definitions KPI', icon: '⚙️', minLevel: 60 },
  { path: '/admin/maintenance', label: 'Maintenance', icon: '🧹', minLevel: 100 },
] as const;

interface SidebarProps {
  collapsed: boolean;
}

export function Sidebar({ collapsed }: SidebarProps) {
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
  const currentUser = useAppStore((s) => s.currentUser);
  const setCurrentUser = useAppStore((s) => s.setCurrentUser);

  const userLevel = currentUser?.profile?.level ?? 100; // fallback admin pour dev

  return (
    <aside
      style={{
        position: 'fixed',
        left: 0,
        top: 0,
        bottom: 0,
        width: collapsed ? 64 : 240,
        background: '#1a1a2e',
        color: '#e0e0e0',
        display: 'flex',
        flexDirection: 'column',
        transition: 'width 0.2s',
        zIndex: 100,
        overflowX: 'hidden',
      }}
    >
      {/* Logo */}
      <div
        style={{
          padding: '16px',
          borderBottom: '1px solid rgba(255,255,255,0.1)',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          minHeight: 64,
        }}
      >
        <span style={{ fontSize: 24 }}>🎯</span>
        {!collapsed && (
          <span style={{ fontWeight: 700, fontSize: 14, whiteSpace: 'nowrap' }}>
            Portail KPI
          </span>
        )}
      </div>

      {/* Utilisateur connecte */}
      {currentUser && !collapsed && (
        <div style={{ padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#ffffff' }}>
            {currentUser.firstName} {currentUser.lastName}
          </div>
          <div style={{ fontSize: 11, color: '#a0a0b0' }}>
            {currentUser.profile.label}
          </div>
        </div>
      )}

      {/* Navigation */}
      <nav style={{ flex: 1, padding: '8px 0', overflowY: 'auto' }}>
        {NAV_ITEMS.filter((item) => (item.minLevel ?? 0) <= userLevel).map((item, i) => {
          if ('section' in item) {
            if (collapsed) return null;
            return (
              <div key={i} style={{
                padding: '12px 16px 4px',
                fontSize: 10,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: 1,
                color: '#606070',
              }}>
                {item.section}
              </div>
            );
          }
          return (
            <NavLink
              key={item.path}
              to={item.path}
              style={({ isActive }) => ({
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '10px 16px',
                color: isActive ? '#ffffff' : '#a0a0b0',
                background: isActive ? 'rgba(255,255,255,0.1)' : 'transparent',
                textDecoration: 'none',
                borderLeft: isActive ? '3px solid #4f94ef' : '3px solid transparent',
                fontSize: 14,
                whiteSpace: 'nowrap',
              })}
            >
              <span style={{ fontSize: 18, minWidth: 20, textAlign: 'center' }}>{item.icon}</span>
              {!collapsed && <span>{item.label}</span>}
            </NavLink>
          );
        })}
      </nav>

      {/* Bouton deconnexion (mode dev) */}
      {currentUser && (
        <button
          onClick={() => setCurrentUser(null)}
          style={{
            margin: '0 16px 8px',
            padding: '8px',
            background: 'rgba(239,68,68,0.2)',
            border: 'none',
            borderRadius: 6,
            color: '#fca5a5',
            cursor: 'pointer',
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          {collapsed ? '🚪' : 'Changer de profil'}
        </button>
      )}

      {/* Toggle */}
      <button
        onClick={toggleSidebar}
        style={{
          margin: '0 16px 16px',
          padding: '8px',
          background: 'rgba(255,255,255,0.1)',
          border: 'none',
          borderRadius: 6,
          color: '#e0e0e0',
          cursor: 'pointer',
          fontSize: 16,
        }}
        title={collapsed ? 'Etendre' : 'Reduire'}
      >
        {collapsed ? '→' : '←'}
      </button>
    </aside>
  );
}
