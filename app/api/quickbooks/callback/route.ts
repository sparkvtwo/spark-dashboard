import { NextRequest, NextResponse } from 'next/server';
import { saveTokens } from '@/lib/qb-token-store';

/**
 * QuickBooks OAuth callback.
 * Exchanges the one-time auth code for tokens and persists them.
 * No session check — the callback is secured by the one-time code + state param.
 */
export async function GET(req: NextRequest) {
  const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
  const { searchParams } = new URL(req.url);

  const code    = searchParams.get('code');
  const realmId = searchParams.get('realmId');
  const error   = searchParams.get('error');

  if (error) {
    console.error('[QB OAuth] Error from QuickBooks:', error);
    return NextResponse.redirect(new URL('/setup?qb_error=' + encodeURIComponent(error), baseUrl));
  }

  if (!code || !realmId) {
    return NextResponse.redirect(new URL('/setup?qb_error=missing_code', baseUrl));
  }

  const clientId     = process.env.QB_CLIENT_ID     || '';
  const clientSecret = process.env.QB_CLIENT_SECRET  || '';
  const redirectUri  = process.env.QB_REDIRECT_URI  || `${baseUrl}/api/quickbooks/callback`;

  if (!clientId || !clientSecret) {
    console.error('[QB OAuth] QB_CLIENT_ID or QB_CLIENT_SECRET not set');
    return NextResponse.redirect(new URL('/setup?qb_error=missing_app_credentials', baseUrl));
  }

  try {
    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    const tokenRes = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${basicAuth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
      },
      body: new URLSearchParams({
        grant_type:   'authorization_code',
        code,
        redirect_uri: redirectUri,
      }).toString(),
    });

    if (!tokenRes.ok) {
      const text = await tokenRes.text();
      console.error('[QB OAuth] Token exchange failed:', tokenRes.status, text);
      return NextResponse.redirect(new URL('/setup?qb_error=token_exchange_failed', baseUrl));
    }

    const tokens = await tokenRes.json() as { refresh_token?: string; access_token: string };

    if (!tokens.refresh_token) {
      console.error('[QB OAuth] No refresh_token in response');
      return NextResponse.redirect(new URL('/setup?qb_error=no_refresh_token', baseUrl));
    }

    await saveTokens({
      realmId,
      refreshToken: tokens.refresh_token,
      accessToken:  tokens.access_token,
    });

    console.log('[QB OAuth] Connected. Realm:', realmId);
    return NextResponse.redirect(new URL('/dashboard?qb_success=true', baseUrl));

  } catch (e) {
    console.error('[QB OAuth] Exception:', e);
    return NextResponse.redirect(new URL('/setup?qb_error=exception', baseUrl));
  }
}
