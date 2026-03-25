import { PublicClientApplication } from "@azure/msal-browser";

const msClientId = String(import.meta.env.VITE_MS_CLIENT_ID || "").trim();
const msTenantId = String(import.meta.env.VITE_MS_TENANT_ID || "common").trim();
const msRedirectUri = String(import.meta.env.VITE_MS_REDIRECT_URI || `${window.location.origin}/login`).trim();

let appInstance = null;

export function getMicrosoftAuthState() {
  if (!msClientId) {
    return {
      configured: false,
      message: "Microsoft login not configured",
    };
  }
  return {
    configured: true,
    message: "",
    clientId: msClientId,
    tenantId: msTenantId || "common",
    redirectUri: msRedirectUri,
  };
}

function getApp() {
  const state = getMicrosoftAuthState();
  if (!state.configured) {
    throw new Error(state.message);
  }

  if (!appInstance) {
    appInstance = new PublicClientApplication({
      auth: {
        clientId: state.clientId,
        authority: `https://login.microsoftonline.com/${state.tenantId}`,
        redirectUri: state.redirectUri,
      },
      cache: {
        cacheLocation: "localStorage",
      },
    });
  }

  return appInstance;
}

export async function signInWithMicrosoft() {
  const state = getMicrosoftAuthState();
  if (!state.configured) {
    throw new Error(state.message);
  }

  const app = getApp();
  await app.initialize();

  const loginResponse = await app.loginPopup({
    scopes: ["User.Read"],
    prompt: "select_account",
  });

  const account = loginResponse.account;
  if (!account) {
    throw new Error("Microsoft account login did not return an account");
  }

  const tokenResponse = await app.acquireTokenSilent({
    account,
    scopes: ["User.Read"],
  }).catch(() =>
    app.acquireTokenPopup({
      scopes: ["User.Read"],
    })
  );

  if (!tokenResponse?.accessToken) {
    throw new Error("Unable to acquire Microsoft access token");
  }

  return {
    accessToken: tokenResponse.accessToken,
    username: account.username || "",
    name: account.name || "",
  };
}
