import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { getCredentials } from '@/lib/qb-token-store';

export async function GET() {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const creds = getCredentials();
  if (!creds) {
    return NextResponse.json({ error: 'No QuickBooks credentials found' }, { status: 404 });
  }

  // Mask the refresh token — never expose the full value via API
  const rt = creds.refreshToken || '';
  const maskedToken = rt.length > 20
    ? `${rt.substring(0, 10)}...${rt.substring(rt.length - 10)}`
    : '(short token)';

  return NextResponse.json({
    realmId: creds.realmId || null,
    refreshTokenMasked: maskedToken,
    clientId: creds.clientId || null,
    hasClientSecret: !!creds.clientSecret,
    source: process.env.QB_REFRESH_TOKEN ? 'env' : 'settings_file',
  });
}
