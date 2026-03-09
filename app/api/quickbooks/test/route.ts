import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { getCredentials, refreshAccessToken as qbRefresh } from '@/lib/qb-token-store';

// ─── QB query ─────────────────────────────────────────────────────────────────

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

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET() {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Load credentials from centralised token store
  const creds = getCredentials();
  if (!creds) {
    return NextResponse.json({ error: 'QuickBooks credentials not configured' }, { status: 400 });
  }

  // Refresh access token (token store handles rotation persistence automatically)
  let accessToken: string;
  try {
    const result = await qbRefresh(creds);
    accessToken = result.accessToken;
    if (result.rotated) {
      console.log('[QB Test] Refresh token was rotated — new token persisted via token store');
    }
  } catch (e) {
    return NextResponse.json({ error: `Token refresh failed: ${e}` }, { status: 500 });
  }

  // Test with CompanyInfo query (always accessible)
  try {
    const companyRes = await qbQuery('SELECT * FROM CompanyInfo', accessToken, creds.realmId);
    const company = (companyRes.data as any)?.QueryResponse?.CompanyInfo?.[0];

    return NextResponse.json({
      success: true,
      company: company?.CompanyName || 'Unknown',
      message: 'QuickBooks connection successful!',
    });
  } catch (e) {
    return NextResponse.json({ error: `CompanyInfo query failed: ${e}` }, { status: 500 });
  }
}
