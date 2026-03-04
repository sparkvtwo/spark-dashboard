import { getServerSession } from 'next-auth';
import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const CACHE_FILE = path.join(process.cwd(), 'data', 'licenses-cache.json');
const SETTINGS_FILE = path.join(process.cwd(), 'data', 'qb-settings.json');

export async function GET() {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const realmId = process.env.QB_REALM_ID || '';
  const hasTokens = !!(process.env.QB_CLIENT_ID && process.env.QB_CLIENT_SECRET && process.env.QB_REFRESH_TOKEN);

  let lastSynced: string | null = null;
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const cached = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
      lastSynced = cached.lastSynced || null;
    }
  } catch { /* ignore */ }

  let settingsFile: Record<string, string> = {};
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      settingsFile = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
    }
  } catch { /* ignore */ }

  return NextResponse.json({
    realmId: realmId || settingsFile.tenantId || null,
    lastSynced,
    configured: hasTokens || !!(settingsFile.clientId && settingsFile.clientSecret),
  });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { clientId, clientSecret, tenantId } = body as { clientId: string; clientSecret: string; tenantId: string };

  if (!clientId || !clientSecret || !tenantId) {
    return NextResponse.json({ error: 'clientId, clientSecret, and tenantId are required' }, { status: 400 });
  }

  // Save settings (not in git)
  fs.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true });
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify({ clientId, clientSecret, tenantId, updatedAt: new Date().toISOString() }, null, 2));

  // Build OAuth authorization URL
  const redirectUri = process.env.QB_REDIRECT_URI || `${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/quickbooks/callback`;
  const scope = 'com.intuit.quickbooks.accounting';
  const state = Buffer.from(JSON.stringify({ ts: Date.now() })).toString('base64');

  const authUrl = `https://appcenter.intuit.com/connect/oauth2?` +
    `client_id=${encodeURIComponent(clientId)}` +
    `&response_type=code` +
    `&scope=${encodeURIComponent(scope)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&state=${encodeURIComponent(state)}`;

  return NextResponse.json({ success: true, authUrl });
}
