import { getServerSession } from 'next-auth';
import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';

const SETTINGS_FILE = path.join(process.cwd(), 'data', 'qb-settings.json');

export async function GET(req: NextRequest) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const realmId = searchParams.get('realmId');
  const error = searchParams.get('error');

  if (error) {
    console.error('[QB OAuth] Error from QuickBooks:', error);
    return NextResponse.redirect(new URL('/dashboard?qb_error=' + encodeURIComponent(error), req.url));
  }

  if (!code || !realmId) {
    return NextResponse.redirect(new URL('/dashboard?qb_error=missing_code', req.url));
  }

  // Load saved credentials
  let clientId = '';
  let clientSecret = '';
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const s = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
      clientId = s.clientId || '';
      clientSecret = s.clientSecret || '';
    }
  } catch (e) {
    console.error('[QB OAuth] Failed to load settings:', e);
    return NextResponse.redirect(new URL('/dashboard?qb_error=settings_load_failed', req.url));
  }

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(new URL('/dashboard?qb_error=no_credentials', req.url));
  }

  // Exchange code for tokens
  const redirectUri = process.env.QB_REDIRECT_URI || `${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/quickbooks/callback`;
  
  try {
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    });

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
      console.error('[QB OAuth] Token exchange failed:', tokenRes.status, text);
      return NextResponse.redirect(new URL('/dashboard?qb_error=token_exchange_failed', req.url));
    }

    const tokens = await tokenRes.json();
    const refreshToken = tokens.refresh_token;
    const accessToken = tokens.access_token;

    if (!refreshToken) {
      console.error('[QB OAuth] No refresh_token in response');
      return NextResponse.redirect(new URL('/dashboard?qb_error=no_refresh_token', req.url));
    }

    // Save tokens to settings file (local dev only - Railway is ephemeral)
    try {
      const settings = fs.existsSync(SETTINGS_FILE) 
        ? JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'))
        : {};
      settings.realmId = realmId;
      settings.refreshToken = refreshToken;
      settings.accessToken = accessToken;
      settings.tokenUpdatedAt = new Date().toISOString();
      fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
    } catch (e) {
      console.error('[QB OAuth] Failed to save settings file:', e);
    }

    console.log('[QB OAuth] Successfully connected. Realm:', realmId);
    console.log('[QB OAuth] REFRESH_TOKEN (add to Railway env):', refreshToken);
    
    // Redirect to a success page that displays the token
    const params = new URLSearchParams({
      realmId: realmId,
      refreshToken: refreshToken,
    });
    return NextResponse.redirect(new URL(`/qb-success?${params.toString()}`, req.url));
    
  } catch (e) {
    console.error('[QB OAuth] Exception during token exchange:', e);
    return NextResponse.redirect(new URL('/dashboard?qb_error=exception', req.url));
  }
}
