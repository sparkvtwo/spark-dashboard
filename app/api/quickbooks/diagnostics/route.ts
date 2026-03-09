import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { getCredentials, refreshAccessToken as qbRefresh } from '@/lib/qb-token-store';

export async function GET() {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const creds = getCredentials();

  const diagnostics: Record<string, unknown> = {
    envVars: {
      hasClientId: !!process.env.QB_CLIENT_ID,
      hasClientSecret: !!process.env.QB_CLIENT_SECRET,
      hasRealmId: !!process.env.QB_REALM_ID,
      hasRefreshToken: !!process.env.QB_REFRESH_TOKEN,
      realmIdValue: creds?.realmId ?? null,
    },
    railwayWriteBack: {
      hasApiToken: !!process.env.RAILWAY_API_TOKEN,
      hasServiceId: !!process.env.RAILWAY_SERVICE_ID,
      hasEnvironmentId: !!(process.env.RAILWAY_ENVIRONMENT_ID || process.env.RAILWAY_ENVIRONMENT_NAME),
    },
    tokenTest: null,
    companyInfo: null,
  };

  if (!creds) {
    return NextResponse.json({ error: 'Missing credentials', diagnostics }, { status: 400 });
  }

  // Test token refresh (also validates rotation persistence)
  let accessToken: string;
  try {
    const result = await qbRefresh(creds);
    accessToken = result.accessToken;
    diagnostics.tokenTest = {
      success: true,
      hasAccessToken: true,
      tokenRotated: result.rotated,
    };
  } catch (e) {
    diagnostics.tokenTest = { success: false, error: String(e) };
    return NextResponse.json({ error: 'Token refresh failed', diagnostics }, { status: 500 });
  }

  // Try to get company info
  try {
    const companyRes = await fetch(
      `https://quickbooks.api.intuit.com/v3/company/${creds.realmId}/companyinfo/${creds.realmId}?minorversion=65`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
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
        error: text,
      };
      return NextResponse.json({
        error: `Company info failed: ${companyRes.status}`,
        diagnostics,
      }, { status: 500 });
    }

    const companyData = await companyRes.json();
    diagnostics.companyInfo = {
      success: true,
      companyName: companyData.CompanyInfo?.CompanyName,
      realmId: companyData.CompanyInfo?.Id,
      intuitTid,
    };

    return NextResponse.json({ success: true, message: 'Connection successful', diagnostics });
  } catch (e) {
    diagnostics.companyInfo = { success: false, error: String(e) };
    return NextResponse.json({ error: 'Exception during company info fetch', diagnostics }, { status: 500 });
  }
}
