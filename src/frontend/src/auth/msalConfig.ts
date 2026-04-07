import { Configuration, LogLevel } from '@azure/msal-browser';

const tenantId = import.meta.env.VITE_AZURE_AD_TENANT_ID as string;
const clientId = import.meta.env.VITE_AZURE_AD_CLIENT_ID as string;

if (!tenantId || !clientId) {
  throw new Error('VITE_AZURE_AD_TENANT_ID and VITE_AZURE_AD_CLIENT_ID must be set');
}

export const msalConfig: Configuration = {
  auth: {
    clientId,
    authority: `https://login.microsoftonline.com/${tenantId}`,
    redirectUri: window.location.origin,
    postLogoutRedirectUri: window.location.origin,
  },
  cache: {
    cacheLocation: 'sessionStorage',
    storeAuthStateInCookie: false,
  },
  system: {
    loggerOptions: {
      loggerCallback: (level, message, containsPii) => {
        if (containsPii) return;
        if (level === LogLevel.Error) console.error('[MSAL]', message);
        if (level === LogLevel.Warning) console.warn('[MSAL]', message);
      },
    },
  },
};

export const loginRequest = {
  scopes: [`api://${clientId}/access_as_user`],
};
