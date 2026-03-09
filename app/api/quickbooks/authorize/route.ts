import { NextResponse } from 'next/server';

/**
 * Initiates the QuickBooks OAuth flow.
 * Credentials come from env vars — no user input required.
 * Redirect the browser here to start the QB auth; QB will redirect back
 * to /api/quickbooks/callback on completion.
 */
export async function GET() {
  const clientId  = process.env.QB_CLIENT_ID;
  const baseUrl   = process.env.NEXTAUTH_URL   || 'http://localhost:3000';
  const redirectUri = process.env.QB_REDIRECT_URI || `${baseUrl}/api/quickbooks/callback`;

  if (!clientId) {
    return NextResponse.json(
      { error: 'QB_CLIENT_ID is not configured. Set it as a Railway environment variable.' },
      { status: 500 }
    );
  }

  const state = Buffer.from(JSON.stringify({ ts: Date.now() })).toString('base64');

  const authUrl =
    `https://appcenter.intuit.com/connect/oauth2` +
    `?client_id=${encodeURIComponent(clientId)}` +
    `&response_type=code` +
    `&scope=${encodeURIComponent('com.intuit.quickbooks.accounting')}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&state=${encodeURIComponent(state)}`;

  return NextResponse.redirect(authUrl);
}
