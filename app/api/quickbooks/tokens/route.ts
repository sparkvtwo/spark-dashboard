import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';

const SETTINGS_FILE = path.join(process.cwd(), 'data', 'qb-settings.json');

export async function GET() {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    if (!fs.existsSync(SETTINGS_FILE)) {
      return NextResponse.json({ error: 'No QuickBooks settings found' }, { status: 404 });
    }

    const settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
    
    // Mask the refresh token for security (show first/last 10 chars only)
    const rt = settings.refreshToken || '';
    const maskedToken = rt.length > 20 
      ? `${rt.substring(0, 10)}...${rt.substring(rt.length - 10)}` 
      : rt;

    return NextResponse.json({
      realmId: settings.realmId || null,
      refreshToken: rt, // Full token - you need this
      refreshTokenMasked: maskedToken,
      clientId: settings.clientId || null,
      hasClientSecret: !!settings.clientSecret,
      tokenUpdatedAt: settings.tokenUpdatedAt || null,
    });
  } catch (e) {
    console.error('[QB Tokens API] Error reading settings:', e);
    return NextResponse.json({ error: 'Failed to read settings' }, { status: 500 });
  }
}
