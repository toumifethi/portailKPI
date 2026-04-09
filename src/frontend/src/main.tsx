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

// Imports Azure AD
import { MsalAuthenticationTemplate } from '@azure/msal-react';
import { InteractionType } from '@azure/msal-browser';
import { AuthProvider } from './auth/AuthProvider';
import { loginRequest } from './auth/msalConfig';
import LoginPage from './pages/LoginPage';

const IS_DEV_AUTH = import.meta.env.VITE_AUTH_MODE === 'dev';

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
