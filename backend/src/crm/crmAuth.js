import { config } from '../config.js';
import { logger } from '../logger.js';

// -----------------------------------------------------------------------
// SAP C4C authentication.
//
// ASSUMPTION (explicitly flagged, not invented business behavior): the
// specification does not describe the exact OAuth mechanics of this SAP
// tenant. This module implements the standard OAuth2 "client_credentials"
// grant, which is the common integration pattern for SAP Sales and Service
// Cloud V2 API access. If this tenant instead uses a different flow
// (e.g. SAML bearer, basic auth), only this file needs to change - no
// other service depends on how the token is obtained.
// -----------------------------------------------------------------------

let cachedToken = null; // { accessToken, expiresAt }

async function requestNewToken() {
  if (!config.sap.tokenUrl || !config.sap.clientId || !config.sap.clientSecret) {
    throw new Error(
      'CRM authentication is not configured (SAP_TOKEN_URL / SAP_CLIENT_ID / SAP_CLIENT_SECRET missing).'
    );
  }

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: config.sap.clientId,
    client_secret: config.sap.clientSecret,
  });

  const res = await fetch(config.sap.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  const text = await res.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = null;
  }

  if (!res.ok || !parsed?.access_token) {
    logger.error('crmAuth', 'Token request failed', { status: res.status });
    throw new Error(`CRM authentication failed (status ${res.status})`);
  }

  const expiresInSeconds = Number(parsed.expires_in || 3600);
  cachedToken = {
    accessToken: parsed.access_token,
    // Refresh 60s before actual expiry to avoid races.
    expiresAt: Date.now() + Math.max(expiresInSeconds - 60, 30) * 1000,
  };

  logger.debug('crmAuth', 'Obtained new CRM access token', { expiresInSeconds });
  return cachedToken.accessToken;
}

export async function getAccessToken() {
  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.accessToken;
  }
  return requestNewToken();
}

// Allows crmClient to force a refresh once, if the CRM rejects a token as
// expired/invalid (401), without looping indefinitely.
export function invalidateToken() {
  cachedToken = null;
}
