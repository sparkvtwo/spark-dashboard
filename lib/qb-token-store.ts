/**
 * QuickBooks Token Store
 *
 * Credentials (QB_CLIENT_ID, QB_CLIENT_SECRET) come from env vars — set once at deploy time.
 * Tokens (refreshToken, accessToken, realmId) are persisted to data/qb-tokens.json.
 *
 * For production persistence, mount a Railway Volume at /app/data.
 * Without a volume, tokens reset on redeploy and a one-time re-auth is needed.
 *
 * Required env vars:
 *   QB_CLIENT_ID      — QuickBooks app client ID
 *   QB_CLIENT_SECRET  — QuickBooks app client secret
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

export interface QBCredentialStatus {
  clientId: boolean;
  clientSecret: boolean;
  realmId: boolean;
  refreshToken: boolean;
}

export interface RefreshResult {
  accessToken: string;
  refreshToken: string;
  rotated: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TOKEN_FILE = path.join(process.cwd(), 'data', 'qb-tokens.json');
const INTUIT_TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';

// ─── In-process cache ─────────────────────────────────────────────────────────
// Cleared on cold start. Prevents redundant refreshes within one request cycle
// and carries rotated tokens between the token-refresh and the next sync call.

let _cached: Partial<QBCredentials> | null = null;

// ─── File helpers ─────────────────────────────────────────────────────────────

function readTokenFile(): Record<string, string> {
  try {
    if (fs.existsSync(TOKEN_FILE)) {
      return JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf-8'));
    }
  } catch { /* ignore */ }
  return {};
}

function writeTokenFile(data: Record<string, string>): void {
  try {
    fs.mkdirSync(path.dirname(TOKEN_FILE), { recursive: true });
    const existing = readTokenFile();
    fs.writeFileSync(
      TOKEN_FILE,
      JSON.stringify({ ...existing, ...data, updatedAt: new Date().toISOString() }, null, 2)
    );
  } catch (e) {
    console.error('[QB TokenStore] Failed to write token file:', e);
  }
}

// ─── Read ─────────────────────────────────────────────────────────────────────

/**
 * Returns full QB credentials or null if any required field is missing.
 * Priority: in-process cache → env vars → token file
 */
export function getCredentials(): QBCredentials | null {
  const file = readTokenFile();

  const clientId     = process.env.QB_CLIENT_ID     || '';
  const clientSecret = process.env.QB_CLIENT_SECRET  || '';

  // Tokens may rotate — cache takes priority so we always use the latest value
  const realmId = _cached?.realmId || process.env.QB_REALM_ID || file.realmId || '';
  const refreshToken = _cached?.refreshToken || process.env.QB_REFRESH_TOKEN || file.refreshToken || '';
  const accessToken  = _cached?.accessToken  || file.accessToken || '';

  if (!clientId || !clientSecret || !realmId || !refreshToken) return null;

  return { clientId, clientSecret, realmId, refreshToken, accessToken };
}

/** Returns which credential fields are present (for diagnostics / UI status). */
export function getCredentialStatus(): QBCredentialStatus {
  const file = readTokenFile();
  return {
    clientId:     !!process.env.QB_CLIENT_ID,
    clientSecret: !!process.env.QB_CLIENT_SECRET,
    realmId:      !!(_cached?.realmId     || process.env.QB_REALM_ID     || file.realmId),
    refreshToken: !!(_cached?.refreshToken || process.env.QB_REFRESH_TOKEN || file.refreshToken),
  };
}

// ─── Write ────────────────────────────────────────────────────────────────────

/**
 * Persist tokens after OAuth callback or token rotation.
 * Writes to in-process cache + token file (Railway Volume if mounted).
 */
export async function saveTokens(params: {
  realmId: string;
  refreshToken: string;
  accessToken: string;
}): Promise<void> {
  if (!_cached) _cached = {};
  _cached.realmId      = params.realmId;
  _cached.refreshToken = params.refreshToken;
  _cached.accessToken  = params.accessToken;

  writeTokenFile({
    realmId:      params.realmId,
    refreshToken: params.refreshToken,
    accessToken:  params.accessToken,
  });

  console.log('[QB TokenStore] Tokens persisted ✓');
}

// ─── Token refresh ────────────────────────────────────────────────────────────

/**
 * Exchanges the stored refresh token for a fresh access token.
 * Automatically persists a new refresh token if QB rotates it.
 */
export async function refreshAccessToken(creds: QBCredentials): Promise<RefreshResult> {
  const basicAuth = Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString('base64');

  const res = await fetch(INTUIT_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${basicAuth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: creds.refreshToken,
    }).toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`QB token refresh failed: ${res.status} ${text}`);
  }

  const tokens = await res.json() as { access_token: string; refresh_token?: string };
  const newAccessToken  = tokens.access_token;
  const newRefreshToken = tokens.refresh_token;
  const rotated = !!newRefreshToken && newRefreshToken !== creds.refreshToken;

  if (rotated) {
    console.log('[QB TokenStore] Refresh token rotated — saving...');
    await saveTokens({ realmId: creds.realmId, refreshToken: newRefreshToken!, accessToken: newAccessToken });
  } else {
    if (!_cached) _cached = {};
    _cached.accessToken = newAccessToken;
    if (newRefreshToken) _cached.refreshToken = newRefreshToken;
  }

  return {
    accessToken:  newAccessToken,
    refreshToken: newRefreshToken ?? creds.refreshToken,
    rotated,
  };
}

// ─── Misc ─────────────────────────────────────────────────────────────────────

export function clearCache(): void {
  _cached = null;
}
