/**
 * QuickBooks Token Store
 *
 * Centralises how QB OAuth tokens are read and persisted.
 *
 * Priority order for reads:
 *   1. In-process cache (fastest; avoids redundant refreshes within same request)
 *   2. Railway environment variables (QB_REFRESH_TOKEN, etc.)
 *   3. Local settings file  (dev only; ephemeral on Railway)
 *
 * Priority order for writes (new refresh token after rotation):
 *   1. Railway Variables API  (RAILWAY_API_TOKEN must be set)
 *   2. Local settings file    (dev / fallback)
 *
 * Required Railway env vars:
 *   QB_CLIENT_ID, QB_CLIENT_SECRET, QB_REALM_ID, QB_REFRESH_TOKEN
 *
 * Optional Railway env vars for write-back:
 *   RAILWAY_API_TOKEN       – Personal or team API token from Railway dashboard
 *   RAILWAY_SERVICE_ID      – Injected automatically by Railway
 *   RAILWAY_ENVIRONMENT_ID  – Injected automatically by Railway (named RAILWAY_ENVIRONMENT_ID)
 *
 * If RAILWAY_API_TOKEN is absent, rotation is only written to the local file.
 */

import * as fs from 'fs';
import * as path from 'path';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface QBCredentials {
  clientId: string;
  clientSecret: string;
  realmId: string;
  refreshToken: string;
  accessToken?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SETTINGS_FILE = path.join(process.cwd(), 'data', 'qb-settings.json');
const INTUIT_TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';

// ─── In-process cache ─────────────────────────────────────────────────────────
// This is reset on cold-start but prevents repeated refreshes within one pod.

let _cached: Partial<QBCredentials> | null = null;

// ─── Read helpers ─────────────────────────────────────────────────────────────

function readSettingsFile(): Record<string, string> {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
    }
  } catch {
    // ignore
  }
  return {};
}

/**
 * Returns the current set of QB credentials, merging sources in priority order.
 * Returns null if any required field is missing.
 */
export function getCredentials(): QBCredentials | null {
  const file = readSettingsFile();

  const clientId =
    process.env.QB_CLIENT_ID ||
    _cached?.clientId ||
    file.clientId ||
    '';
  const clientSecret =
    process.env.QB_CLIENT_SECRET ||
    _cached?.clientSecret ||
    file.clientSecret ||
    '';
  const realmId =
    process.env.QB_REALM_ID ||
    _cached?.realmId ||
    file.realmId ||
    file.tenantId ||
    '';
  const refreshToken =
    // In-process cache takes priority over env var so we use the latest rotated token
    _cached?.refreshToken ||
    process.env.QB_REFRESH_TOKEN ||
    file.refreshToken ||
    '';
  const accessToken =
    _cached?.accessToken ||
    process.env.QB_ACCESS_TOKEN ||
    file.accessToken ||
    '';

  if (!clientId || !clientSecret || !realmId || !refreshToken) return null;

  return { clientId, clientSecret, realmId, refreshToken, accessToken };
}

// ─── Write helpers ────────────────────────────────────────────────────────────

/** Persist a new refresh (and optionally access) token after QB rotation. */
export async function saveRotatedTokens(
  refreshToken: string,
  accessToken?: string
): Promise<void> {
  // Always update in-process cache immediately
  if (!_cached) _cached = {};
  _cached.refreshToken = refreshToken;
  if (accessToken) _cached.accessToken = accessToken;

  // Attempt Railway Variables API first (prod persistence)
  const railwayWritten = await tryUpdateRailwayVariable('QB_REFRESH_TOKEN', refreshToken);

  if (railwayWritten) {
    console.log('[QB TokenStore] Refresh token rotation persisted to Railway variables ✓');
  } else {
    console.warn('[QB TokenStore] Railway API unavailable — persisting to local file only (ephemeral on Railway)');
  }

  // Always write to local file as a fallback / for dev environments
  writeSettingsFileToken(refreshToken, accessToken);
}

function writeSettingsFileToken(refreshToken: string, accessToken?: string): void {
  try {
    fs.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true });
    const existing = readSettingsFile();
    existing.refreshToken = refreshToken;
    existing.tokenUpdatedAt = new Date().toISOString();
    if (accessToken) existing.accessToken = accessToken;
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(existing, null, 2));
  } catch (e) {
    console.error('[QB TokenStore] Failed to write settings file:', e);
  }
}

// ─── Railway Variables API ────────────────────────────────────────────────────
// Uses Railway's GraphQL API (v2) to update an environment variable in-place.
// This requires RAILWAY_API_TOKEN, RAILWAY_SERVICE_ID, RAILWAY_ENVIRONMENT_ID.

async function tryUpdateRailwayVariable(name: string, value: string): Promise<boolean> {
  const token = process.env.RAILWAY_API_TOKEN;
  const serviceId = process.env.RAILWAY_SERVICE_ID;
  const environmentId =
    process.env.RAILWAY_ENVIRONMENT_ID ||
    process.env.RAILWAY_ENVIRONMENT_NAME; // fallback for older Railway versions

  if (!token || !serviceId || !environmentId) {
    if (!token) {
      console.warn(
        '[QB TokenStore] RAILWAY_API_TOKEN not set — cannot auto-persist rotated refresh token.\n' +
        '  → Add RAILWAY_API_TOKEN (Railway dashboard → Settings → Tokens) to enable auto-rotation.'
      );
    }
    return false;
  }

  // Railway GraphQL v2 mutation to upsert a variable
  const mutation = `
    mutation UpsertVariable($input: VariableUpsertInput!) {
      variableUpsert(input: $input)
    }
  `;

  const variables = {
    input: {
      serviceId,
      environmentId,
      name,
      value,
    },
  };

  try {
    const res = await fetch('https://backboard.railway.app/graphql/v2', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: mutation, variables }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error('[QB TokenStore] Railway API HTTP error:', res.status, text);
      return false;
    }

    const json = await res.json() as { data?: unknown; errors?: { message: string }[] };
    if (json.errors?.length) {
      console.error('[QB TokenStore] Railway API GraphQL errors:', json.errors);
      return false;
    }

    return true;
  } catch (e) {
    console.error('[QB TokenStore] Railway API exception:', e);
    return false;
  }
}

// ─── Token refresh ────────────────────────────────────────────────────────────

export interface RefreshResult {
  accessToken: string;
  refreshToken: string; // may be unchanged or a brand-new rotated value
  rotated: boolean;
}

/**
 * Uses the stored refresh token to obtain a fresh access token.
 * If QB rotates the refresh token, the new value is automatically persisted.
 */
export async function refreshAccessToken(creds: QBCredentials): Promise<RefreshResult> {
  const credentials = Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString('base64');
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: creds.refreshToken,
  });

  const res = await fetch(INTUIT_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
    },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`QB token refresh failed: ${res.status} ${text}`);
  }

  const tokens = await res.json() as { access_token: string; refresh_token?: string };
  const newAccessToken = tokens.access_token;
  const newRefreshToken = tokens.refresh_token;

  const rotated = !!newRefreshToken && newRefreshToken !== creds.refreshToken;

  if (rotated) {
    console.log('[QB TokenStore] Refresh token rotated — persisting new token...');
    await saveRotatedTokens(newRefreshToken!, newAccessToken);
  } else {
    // Still cache the access token in-process
    if (!_cached) _cached = {};
    _cached.accessToken = newAccessToken;
    if (newRefreshToken) _cached.refreshToken = newRefreshToken;
  }

  return {
    accessToken: newAccessToken,
    refreshToken: newRefreshToken ?? creds.refreshToken,
    rotated,
  };
}

// ─── Save all tokens (e.g. after initial OAuth callback) ─────────────────────

export async function saveAllTokens(params: {
  clientId?: string;
  clientSecret?: string;
  realmId: string;
  refreshToken: string;
  accessToken: string;
}): Promise<void> {
  // Update in-process cache
  _cached = { ..._cached, ...params };

  // Persist refresh token to Railway
  const railwayWritten = await tryUpdateRailwayVariable('QB_REFRESH_TOKEN', params.refreshToken);
  if (railwayWritten) {
    // Also persist realmId since it may have changed
    await tryUpdateRailwayVariable('QB_REALM_ID', params.realmId);
    console.log('[QB TokenStore] Tokens persisted to Railway variables ✓');
  }

  // Always write locally too
  writeSettingsFileToken(params.refreshToken, params.accessToken);
  try {
    const existing = readSettingsFile();
    existing.realmId = params.realmId;
    if (params.clientId) existing.clientId = params.clientId;
    if (params.clientSecret) existing.clientSecret = params.clientSecret;
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(existing, null, 2));
  } catch { /* ignore */ }
}

// ─── Save credentials (clientId, clientSecret, realmId) to Railway vars ──────
// Called when user submits the QB Settings form, before the OAuth redirect.
// Ensures credentials survive Railway redeploys so the callback can always
// exchange the auth code — even if the local settings file has been wiped.

export async function saveAllCredentials(params: {
  clientId: string;
  clientSecret: string;
  realmId: string;
}): Promise<void> {
  // Update in-process cache
  if (!_cached) _cached = {};
  _cached.clientId = params.clientId;
  _cached.clientSecret = params.clientSecret;
  _cached.realmId = params.realmId;

  // Persist to Railway env vars
  const results = await Promise.all([
    tryUpdateRailwayVariable('QB_CLIENT_ID', params.clientId),
    tryUpdateRailwayVariable('QB_CLIENT_SECRET', params.clientSecret),
    tryUpdateRailwayVariable('QB_REALM_ID', params.realmId),
  ]);

  if (results.some(Boolean)) {
    console.log('[QB TokenStore] Credentials persisted to Railway variables ✓');
  } else {
    console.warn('[QB TokenStore] Could not persist credentials to Railway — local file only');
  }
}

// ─── Clear in-process cache (useful in tests) ─────────────────────────────────

export function clearCache(): void {
  _cached = null;
}
