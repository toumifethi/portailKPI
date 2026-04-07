import axios, { AxiosInstance } from 'axios';
import { PublicClientApplication } from '@azure/msal-browser';
import { msalConfig, loginRequest } from '@/auth/msalConfig';

const msalInstance = new PublicClientApplication(msalConfig);

function createApiClient(): AxiosInstance {
  const client = axios.create({
    baseURL: '/api',
    headers: { 'Content-Type': 'application/json' },
    timeout: 30_000,
  });

  // Intercepteur : ajoute le Bearer token Azure AD (ignoré en mode dev)
  client.interceptors.request.use(async (config) => {
    if (import.meta.env.VITE_AUTH_MODE === 'dev') {
      config.headers.Authorization = 'Bearer dev-bypass-token';
      // Envoyer l'ID du collaborateur simulé
      const stored = localStorage.getItem('portail-kpi-app');
      if (stored) {
        try {
          const state = JSON.parse(stored)?.state;
          if (state?.currentUser?.id) {
            config.headers['X-Dev-User-Id'] = String(state.currentUser.id);
          }
        } catch { /* ignore */ }
      }
      return config;
    }

    const accounts = msalInstance.getAllAccounts();
    if (accounts.length === 0) return config;

    try {
      const response = await msalInstance.acquireTokenSilent({
        ...loginRequest,
        account: accounts[0],
      });
      config.headers.Authorization = `Bearer ${response.accessToken}`;
    } catch {
      await msalInstance.acquireTokenRedirect(loginRequest);
    }

    return config;
  });

  // Intercepteur réponse : normalise les erreurs
  client.interceptors.response.use(
    (response) => response,
    (error) => {
      if (error.response?.status === 401) {
        msalInstance.acquireTokenRedirect(loginRequest);
      }
      return Promise.reject(error);
    },
  );

  return client;
}

export const apiClient = createApiClient();
