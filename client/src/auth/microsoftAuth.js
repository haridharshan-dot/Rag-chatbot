import { PublicClientApplication } from "@azure/msal-browser";

const msClientId = import.meta.env.VITE_MS_CLIENT_ID || "";
const msTenantId = import.meta.env.VITE_MS_TENANT_ID || "common";
const msRedirectUri = import.meta.env.VITE_MS_REDIRECT_URI || `${window.location.origin}/agent`;

let appInstance = null;

function getApp() {
  if (!msClientId) {
    throw new Error("VITE_MS_CLIENT_ID is not configured");
  }

  if (!appInstance) {
    appInstance = new PublicClientApplication({
      auth: {
        clientId: msClientId,
        authority: `https://login.microsoftonline.com/${msTenantId}`,
        redirectUri: msRedirectUri,
      },
      cache: {
        cacheLocation: "localStorage",
      },
    });
  }

  return appInstance;
}

export async function signInWithMicrosoft() {
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
