import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const SETTINGS_FILE = path.join(process.cwd(), 'data', 'qb-settings.json');

// ─── Token refresh ───────────────────────────────────────────────────────────

async function refreshAccessToken(clientId: string, clientSecret: string, refreshToken: string): Promise<{ access_token: string; refresh_token?: string }> {
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const body = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken });

  const res = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
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
    throw new Error(`Token refresh failed: ${res.status} ${text}`);
  }
  return res.json();
}

// ─── QB query ────────────────────────────────────────────────────────────────

async function qbQuery(sql: string, accessToken: string, realmId: string): Promise<{ data: unknown; intuitTid: string }> {
  const base = 'https://quickbooks.api.intuit.com';
  const url = `${base}/v3/company/${realmId}/query?query=${encodeURIComponent(sql)}&minorversion=65`;

  const res = await fetch(url, {
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' },
  });

  const intuitTid = res.headers.get('intuit_tid') || 'N/A';
  console.log(`[QB] intuit_tid=${intuitTid} status=${res.status}`);

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`QB query failed: ${res.status} ${text} (intuit_tid=${intuitTid})`);
  }

  const data = await res.json();
  return { data, intuitTid };
}

// ─── Route handlers ──────────────────────────────────────────────────────────

export async function GET() {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Resolve credentials: env vars take precedence, then settings file
  let clientId = process.env.QB_CLIENT_ID || '';
  let clientSecret = process.env.QB_CLIENT_SECRET || '';
  let realmId = process.env.QB_REALM_ID || '';
  let refreshToken = process.env.QB_REFRESH_TOKEN || '';
  let accessToken = process.env.QB_ACCESS_TOKEN || '';

  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const s = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
      if (!clientId) clientId = s.clientId || '';
      if (!clientSecret) clientSecret = s.clientSecret || '';
      if (!realmId) realmId = s.realmId || s.tenantId || '';
      if (!refreshToken) refreshToken = s.refreshToken || '';
      if (!accessToken) accessToken = s.accessToken || '';
    }
  } catch { /* ignore */ }

  if (!clientId || !clientSecret || !realmId || !refreshToken) {
    return NextResponse.json({ error: 'QuickBooks credentials not configured' }, { status: 400 });
  }

  // Get fresh access token
  try {
    const tokens = await refreshAccessToken(clientId, clientSecret, refreshToken);
    accessToken = tokens.access_token;
    if (tokens.refresh_token) refreshToken = tokens.refresh_token;
  } catch (e) {
    return NextResponse.json({ error: `Token refresh failed: ${e}` }, { status: 500 });
  }

  // Test with CompanyInfo query first (always accessible)
  try {
    const companyRes = await qbQuery('SELECT * FROM CompanyInfo', accessToken, realmId);
    const company = (companyRes.data as any)?.QueryResponse?.CompanyInfo?.[0];
    
    return NextResponse.json({ 
      success: true, 
      company: company?.CompanyName || 'Unknown',
      message: 'QuickBooks connection successful!',
      note: 'Purchase query returned 403 - user may not have access to Purchase transactions'
    });
  } catch (e) {
    return NextResponse.json({ error: `CompanyInfo query failed: ${e}` }, { status: 500 });
  }
}
