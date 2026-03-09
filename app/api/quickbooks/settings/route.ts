import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { getCredentialStatus } from '@/lib/qb-token-store';
import fs from 'fs';
import path from 'path';

const CACHE_FILE = path.join(process.cwd(), 'data', 'licenses-cache.json');

export async function GET() {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const status = getCredentialStatus();

  let lastSynced: string | null = null;
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const cached = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
      lastSynced = cached.lastSynced || null;
    }
  } catch { /* ignore */ }

  return NextResponse.json({
    configured: status.clientId && status.clientSecret && status.realmId && status.refreshToken,
    missingAppCredentials: !status.clientId || !status.clientSecret,
    needsAuth: status.clientId && status.clientSecret && (!status.realmId || !status.refreshToken),
    lastSynced,
  });
}
