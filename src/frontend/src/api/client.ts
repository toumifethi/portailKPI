import axios, { AxiosInstance } from 'axios';

const IS_DEV_AUTH = import.meta.env.VITE_AUTH_MODE === 'dev';

// MSAL initialisé uniquement en mode azure (évite le crash crypto en mode dev)
let msalInstance: import('@azure/msal-browser').PublicClientApplication | null = null;
let loginRequest: { scopes: string[] } | null = null;

if (!IS_DEV_AUTH) {
  const { PublicClientApplication } = require('@azure/msal-browser') as typeof import('@azure/msal-browser');
  const msalConfig = require('@/auth/msalConfig') as typeof import('@/auth/msalConfig');
  msalInstance = new PublicClientApplication(msalConfig.msalConfig);
  loginRequest = msalConfig.loginRequest;
}

function createApiClient(): AxiosInstance {
  const client = axios.create({
    baseURL: '/api',
    headers: { 'Content-Type': 'application/json' },
    timeout: 30_000,
  });

  client.interceptors.request.use(async (config) => {
    if (IS_DEV_AUTH) {
      config.headers.Authorization = 'Bearer dev-bypass-token';
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

    if (!msalInstance || !loginRequest) return config;

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

  client.interceptors.response.use(
    (response) => response,
    (error) => {
      if (error.response?.status === 401 && msalInstance && loginRequest) {
        msalInstance.acquireTokenRedirect(loginRequest);
      }
      return Promise.reject(error);
    },
  );

  return client;
}

export const apiClient = createApiClient();
