import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { clearCache } from '@/lib/qb-token-store';
import fs from 'fs';
import path from 'path';

const TOKEN_FILE = path.join(process.cwd(), 'data', 'qb-tokens.json');

/**
 * Clears all stored QB tokens (token file + in-process cache).
 * Use when credentials have changed and the stored token is stale.
 * After calling this, visit /setup to re-authorize.
 */
export async function POST() {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    if (fs.existsSync(TOKEN_FILE)) {
      fs.unlinkSync(TOKEN_FILE);
    }
  } catch (e) {
    console.error('[QB Reset] Failed to delete token file:', e);
  }

  clearCache();

  return NextResponse.json({ ok: true, message: 'QB tokens cleared. Visit /setup to reconnect.' });
}
