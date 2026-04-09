import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppLayout } from './components/layout/AppLayout';
import { DevAuthProvider } from './auth/DevAuthProvider';
import DashboardPage from './pages/DashboardPage';
import EvolutionPage from './pages/EvolutionPage';
import CrossClientPage from './pages/CrossClientPage';
import CollaboratorsAdminPage from './pages/admin/CollaboratorsPage';
import JiraUsersPage from './pages/admin/JiraUsersPage';
import ClientsPage from './pages/admin/ClientsPage';
import IssuesPage from './pages/IssuesPage';
import WorklogsPage from './pages/WorklogsPage';
import CollaborateursPage from './pages/CollaborateursPage';
import JiraConnectionsPage from './pages/admin/JiraConnectionsPage';
import KpiConfigPage from './pages/admin/KpiConfigPage';
import SchedulingPage from './pages/admin/SchedulingPage';
import ProfilesPage from './pages/admin/ProfilesPage';
import MaintenancePage from './pages/admin/MaintenancePage';
import IssueLinksPage from './pages/IssueLinksPage';
import TransitionsPage from './pages/TransitionsPage';

const IS_DEV_AUTH = import.meta.env.VITE_AUTH_MODE === 'dev';

// Azure AD imports — chargés uniquement en mode azure pour éviter le crash MSAL en mode dev
let MsalAuthenticationTemplate: typeof import('@azure/msal-react').MsalAuthenticationTemplate;
let InteractionType: typeof import('@azure/msal-browser').InteractionType;
let AuthProvider: typeof import('./auth/AuthProvider').AuthProvider;
let loginRequest: typeof import('./auth/msalConfig').loginRequest;
let LoginPage: typeof import('./pages/LoginPage').default;

if (!IS_DEV_AUTH) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const msalReact = require('@azure/msal-react') as typeof import('@azure/msal-react');
  const msalBrowser = require('@azure/msal-browser') as typeof import('@azure/msal-browser');
  const authProvider = require('./auth/AuthProvider') as typeof import('./auth/AuthProvider');
  const msalConfig = require('./auth/msalConfig') as typeof import('./auth/msalConfig');
  const loginPageModule = require('./pages/LoginPage') as { default: typeof import('./pages/LoginPage').default };

  MsalAuthenticationTemplate = msalReact.MsalAuthenticationTemplate;
  InteractionType = msalBrowser.InteractionType;
  AuthProvider = authProvider.AuthProvider;
  loginRequest = msalConfig.loginRequest;
  LoginPage = loginPageModule.default;
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 2 * 60 * 1000,
      retry: 1,
    },
  },
});

const protectedRoutes = (
  <Route element={<AppLayout />}>
    <Route index element={<Navigate to="/dashboard" replace />} />
    <Route path="/dashboard" element={<DashboardPage />} />
    <Route path="/evolution" element={<EvolutionPage />} />
    <Route path="/cross-client" element={<CrossClientPage />} />
    <Route path="/admin/collaborators" element={<CollaboratorsAdminPage />} />
    <Route path="/admin/jira-users" element={<JiraUsersPage />} />
    <Route path="/admin/clients" element={<ClientsPage />} />
    <Route path="/admin/jira-connections" element={<JiraConnectionsPage />} />
    <Route path="/admin/kpi-config" element={<KpiConfigPage />} />
    <Route path="/admin/scheduling" element={<SchedulingPage />} />
    <Route path="/admin/profiles" element={<ProfilesPage />} />
    <Route path="/admin/maintenance" element={<MaintenancePage />} />
    <Route path="/issues" element={<IssuesPage />} />
    <Route path="/worklogs" element={<WorklogsPage />} />
    <Route path="/collaborateurs" element={<CollaborateursPage />} />
    <Route path="/issue-links" element={<IssueLinksPage />} />
    <Route path="/transitions" element={<TransitionsPage />} />
  </Route>
);

function App() {
  if (IS_DEV_AUTH) {
    return (
      <DevAuthProvider>
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            <Routes>
              {protectedRoutes}
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </BrowserRouter>
        </QueryClientProvider>
      </DevAuthProvider>
    );
  }

  return (
    <AuthProvider>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              element={
                <MsalAuthenticationTemplate
                  interactionType={InteractionType.Redirect}
                  authenticationRequest={loginRequest}
                >
                  <AppLayout />
                </MsalAuthenticationTemplate>
              }
            >
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/evolution" element={<EvolutionPage />} />
              <Route path="/cross-client" element={<CrossClientPage />} />
              <Route path="/issues" element={<IssuesPage />} />
              <Route path="/worklogs" element={<WorklogsPage />} />
              <Route path="/collaborateurs" element={<CollaborateursPage />} />
              <Route path="/admin/collaborators" element={<CollaboratorsAdminPage />} />
              <Route path="/admin/jira-users" element={<JiraUsersPage />} />
              <Route path="/admin/clients" element={<ClientsPage />} />
              <Route path="/admin/jira-connections" element={<JiraConnectionsPage />} />
              <Route path="/admin/kpi-config" element={<KpiConfigPage />} />
              <Route path="/admin/scheduling" element={<SchedulingPage />} />
              <Route path="/admin/maintenance" element={<MaintenancePage />} />
              <Route path="/issue-links" element={<IssueLinksPage />} />
              <Route path="/transitions" element={<TransitionsPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </BrowserRouter>
      </QueryClientProvider>
    </AuthProvider>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
