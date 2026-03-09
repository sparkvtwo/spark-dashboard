import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const SETTINGS_FILE = path.join(process.cwd(), 'data', 'qb-settings.json');

export async function GET() {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Get credentials
  let clientId = process.env.QB_CLIENT_ID || '';
  let clientSecret = process.env.QB_CLIENT_SECRET || '';
  let realmId = process.env.QB_REALM_ID || '';
  let refreshToken = process.env.QB_REFRESH_TOKEN || '';

  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const s = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
      if (!clientId) clientId = s.clientId || '';
      if (!clientSecret) clientSecret = s.clientSecret || '';
      if (!realmId) realmId = s.realmId || s.tenantId || '';
      if (!refreshToken) refreshToken = s.refreshToken || '';
    }
  } catch { /* ignore */ }

  const diagnostics = {
    envVars: {
      hasClientId: !!process.env.QB_CLIENT_ID,
      hasClientSecret: !!process.env.QB_CLIENT_SECRET,
      hasRealmId: !!process.env.QB_REALM_ID,
      hasRefreshToken: !!process.env.QB_REFRESH_TOKEN,
      realmIdValue: realmId,
    },
    tokenTest: null as any,
    companyInfo: null as any,
  };

  if (!clientId || !clientSecret || !realmId || !refreshToken) {
    return NextResponse.json({ 
      error: 'Missing credentials', 
      diagnostics 
    }, { status: 400 });
  }

  // Test token refresh
  try {
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const body = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken });

    const tokenRes = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
      },
      body: body.toString(),
    });

    if (!tokenRes.ok) {
      const text = await tokenRes.text();
      diagnostics.tokenTest = { success: false, status: tokenRes.status, error: text };
      return NextResponse.json({ error: 'Token refresh failed', diagnostics }, { status: 500 });
    }

    const tokens = await tokenRes.json();
    diagnostics.tokenTest = { success: true, hasAccessToken: !!tokens.access_token };

    // Try to get company info
    const companyRes = await fetch(
      `https://quickbooks.api.intuit.com/v3/company/${realmId}/companyinfo/${realmId}?minorversion=65`,
      {
        headers: { 
          'Authorization': `Bearer ${tokens.access_token}`, 
          'Accept': 'application/json' 
        },
      }
    );

    const intuitTid = companyRes.headers.get('intuit_tid') || 'N/A';
    
    if (!companyRes.ok) {
      const text = await companyRes.text();
      diagnostics.companyInfo = { 
        success: false, 
        status: companyRes.status, 
        intuitTid,
        error: text 
      };
      return NextResponse.json({ 
        error: `Company info failed: ${companyRes.status}`, 
        diagnostics 
      }, { status: 500 });
    }

    const companyData = await companyRes.json();
    diagnostics.companyInfo = { 
      success: true, 
      companyName: companyData.CompanyInfo?.CompanyName,
      realmId: companyData.CompanyInfo?.Id,
    };

    return NextResponse.json({ 
      success: true, 
      message: 'Connection successful',
      diagnostics 
    });

  } catch (e) {
    diagnostics.tokenTest = { success: false, error: String(e) };
    return NextResponse.json({ error: 'Exception', diagnostics }, { status: 500 });
  }
}
