import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const CACHE_FILE = path.join(process.cwd(), 'data', 'licenses-cache.json');
const SETTINGS_FILE = path.join(process.cwd(), 'data', 'qb-settings.json');
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// ─── Vendor categorization (ported from qb_client.py / licenses importer) ───

const VENDOR_MAP: Record<string, { name: string; category: string }> = {
  'intuit':           { name: 'QuickBooks',       category: 'Finance' },
  'quickbooks':       { name: 'QuickBooks',       category: 'Finance' },
  'linkedin':         { name: 'LinkedIn',          category: 'Marketing' },
  'slack':            { name: 'Slack',             category: 'Communication' },
  'google':           { name: 'Google',            category: 'Infrastructure' },
  'amazon':           { name: 'Amazon/AWS',        category: 'Infrastructure' },
  'aws':              { name: 'Amazon/AWS',        category: 'Infrastructure' },
  'microsoft':        { name: 'Microsoft',         category: 'Productivity' },
  'github':           { name: 'GitHub',            category: 'Dev Tools' },
  'circleci':         { name: 'Circle CI',         category: 'Dev Tools' },
  'circle ci':        { name: 'Circle CI',         category: 'Dev Tools' },
  'figma':            { name: 'Figma',             category: 'Design' },
  'docusign':         { name: 'DocuSign',          category: 'Productivity' },
  'anthropic':        { name: 'Anthropic',         category: 'AI' },
  'openai':           { name: 'OpenAI',            category: 'AI' },
  'sonarsource':      { name: 'SonarSource',       category: 'Dev Tools' },
  'sonarqube':        { name: 'SonarSource',       category: 'Dev Tools' },
  '650 industries':   { name: '650 Industries',    category: 'Dev Tools' },
  'squarespace':      { name: 'SquareSpace',       category: 'Marketing' },
  'webflow':          { name: 'Webflow',           category: 'Marketing' },
  'notion':           { name: 'Notion',            category: 'Productivity' },
  'zoom':             { name: 'Zoom',              category: 'Communication' },
  'hubspot':          { name: 'HubSpot',           category: 'Marketing' },
  'salesforce':       { name: 'Salesforce',        category: 'Marketing' },
  'datadog':          { name: 'Datadog',           category: 'Infrastructure' },
  'heroku':           { name: 'Heroku',            category: 'Infrastructure' },
  'twilio':           { name: 'Twilio',            category: 'Infrastructure' },
  'stripe':           { name: 'Stripe',            category: 'Finance' },
  'atlassian':        { name: 'Atlassian',         category: 'Dev Tools' },
  'jira':             { name: 'Atlassian',         category: 'Dev Tools' },
  'confluence':       { name: 'Atlassian',         category: 'Dev Tools' },
  'adobe':            { name: 'Adobe',             category: 'Design' },
  'dropbox':          { name: 'Dropbox',           category: 'Productivity' },
  'box':              { name: 'Box',               category: 'Productivity' },
  'intercom':         { name: 'Intercom',          category: 'Marketing' },
  'zendesk':          { name: 'Zendesk',           category: 'Productivity' },
};

function categorizeVendor(vendorName: string): { name: string; category: string } {
  const lower = vendorName.toLowerCase();
  for (const [key, val] of Object.entries(VENDOR_MAP)) {
    if (lower.includes(key)) return val;
  }
  return { name: vendorName, category: 'Other' };
}

interface QBPurchase {
  Id: string;
  TxnDate: string;
  TotalAmt: number;
  EntityRef?: { name?: string };
  Line?: Array<{ Amount?: number; Description?: string }>;
}

interface LicenseEntry {
  id: string;
  name: string;
  vendor: string;
  category: string;
  seats: number;
  costPerSeat: number;
  totalMonthlyCost: number;
  billingCycle: string;
  annualCost: number;
  renewalDate: string;
  owner: string;
  notes: string;
  status: string;
  addedDate: string;
  reviewFlag?: string;
}

function purchasesToLicenses(purchases: QBPurchase[]): LicenseEntry[] {
  // Group by vendor
  const groups: Record<string, { total: number; count: number; vendorRaw: string }> = {};

  for (const p of purchases) {
    const vendorRaw = p.EntityRef?.name || 'Unknown';
    const key = categorizeVendor(vendorRaw).name;
    if (!groups[key]) groups[key] = { total: 0, count: 0, vendorRaw };
    groups[key].total += p.TotalAmt || 0;
    groups[key].count += 1;
  }

  const now = new Date();
  const renewalDate = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString().split('T')[0];
  const addedDate = now.toISOString().split('T')[0];
  const owner = 'chris@vtwo.co';

  return Object.entries(groups).map(([key, g]) => {
    const { name, category } = categorizeVendor(g.vendorRaw);
    const totalMonthly = g.total / 12;
    const annualCost = g.total;
    const id = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);

    let reviewFlag: string | undefined;
    if (annualCost > 10000) reviewFlag = `High spend $${Math.round(annualCost / 1000)}k/yr — confirm seats and plan`;
    if (category === 'Finance' && name.toLowerCase().includes('payment')) reviewFlag = 'Payment processing fees — not a software license, verify';
    if (name === '650 Industries') reviewFlag = 'Unknown vendor — needs identification';

    return {
      id,
      name,
      vendor: name,
      category,
      seats: 1,
      costPerSeat: 0,
      totalMonthlyCost: Math.round(totalMonthly * 100) / 100,
      billingCycle: 'monthly',
      annualCost: Math.round(annualCost * 100) / 100,
      renewalDate,
      owner,
      notes: `Imported from QuickBooks (${g.count} transactions).`,
      status: 'active',
      addedDate,
      ...(reviewFlag ? { reviewFlag } : {}),
    };
  });
}

// ─── Token refresh ───────────────────────────────────────────────────────────

async function refreshAccessToken(clientId: string, clientSecret: string, refreshToken: string): Promise<{ access_token: string; refresh_token?: string }> {
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const body = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken });

  const res = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
    },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token refresh failed: ${res.status} ${text}`);
  }
  return res.json();
}

// ─── QB query ────────────────────────────────────────────────────────────────

async function qbQuery(sql: string, accessToken: string, realmId: string, retryWithRefresh?: () => Promise<string>): Promise<{ data: unknown; intuitTid: string }> {
  const base = process.env.QB_ENVIRONMENT === 'production'
    ? 'https://quickbooks.api.intuit.com'
    : 'https://sandbox-quickbooks.api.intuit.com';

  const url = `${base}/v3/company/${realmId}/query?query=${encodeURIComponent(sql)}&minorversion=65`;

  const res = await fetch(url, {
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' },
  });

  const intuitTid = res.headers.get('intuit_tid') || 'N/A';
  console.log(`[QB] intuit_tid=${intuitTid} status=${res.status}`);

  if (res.status === 401 && retryWithRefresh) {
    console.log('[QB] Token expired, refreshing...');
    const newToken = await retryWithRefresh();
    return qbQuery(sql, newToken, realmId); // no retryWithRefresh on second attempt
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`QB query failed: ${res.status} ${text} (intuit_tid=${intuitTid})`);
  }

  const data = await res.json();
  return { data, intuitTid };
}

// ─── Route handlers ──────────────────────────────────────────────────────────

export async function GET() {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Check 5-minute cache first
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const cached = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
      const age = Date.now() - new Date(cached.lastSynced).getTime();
      if (age < CACHE_TTL_MS) {
        return NextResponse.json({ ...cached, fromCache: true });
      }
    }
  } catch { /* ignore cache errors */ }

  // Resolve credentials: env vars take precedence, then settings file
  let clientId = process.env.QB_CLIENT_ID || '';
  let clientSecret = process.env.QB_CLIENT_SECRET || '';
  let realmId = process.env.QB_REALM_ID || '';
  let refreshToken = process.env.QB_REFRESH_TOKEN || '';
  let accessToken = process.env.QB_ACCESS_TOKEN || '';

  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const s = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
      if (!clientId) clientId = s.clientId || '';
      if (!clientSecret) clientSecret = s.clientSecret || '';
      if (!realmId) realmId = s.tenantId || '';
    }
  } catch { /* ignore */ }

  if (!clientId || !clientSecret || !realmId || !refreshToken) {
    // Fall back to cache (stale) or seed data
    return serveCachedOrSeed('QuickBooks credentials not configured.');
  }

  // Token refresh helper
  const doRefresh = async (): Promise<string> => {
    const tokens = await refreshAccessToken(clientId, clientSecret, refreshToken);
    accessToken = tokens.access_token;
    if (tokens.refresh_token) refreshToken = tokens.refresh_token;
    return accessToken;
  };

  // Ensure we have an access token
  if (!accessToken) {
    try { accessToken = await doRefresh(); } catch (e) {
      return serveCachedOrSeed(`Token refresh failed: ${e}`);
    }
  }

  try {
    const start = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const sql = `SELECT * FROM Purchase WHERE TxnDate >= '${start}' MAXRESULTS 1000`;

    const { data } = await qbQuery(sql, accessToken, realmId, doRefresh);
    const purchases: QBPurchase[] = (data as any)?.QueryResponse?.Purchase || [];
    console.log(`[QB] Fetched ${purchases.length} purchase transactions`);

    const licenses = purchasesToLicenses(purchases);
    const totalAnnual = licenses.reduce((s, l) => s + l.annualCost, 0);
    const totalMonthly = licenses.reduce((s, l) => s + l.totalMonthlyCost, 0);
    const lastSynced = new Date().toISOString();

    const result = { licenses, lastSynced, totalAnnual, totalMonthly };

    // Save cache
    fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
    fs.writeFileSync(CACHE_FILE, JSON.stringify(result, null, 2));

    return NextResponse.json(result);
  } catch (e) {
    console.error('[QB] Sync error:', e);
    return serveCachedOrSeed(`QuickBooks sync failed: ${e}`);
  }
}

function serveCachedOrSeed(warning: string) {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const cached = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
      return NextResponse.json({ ...cached, warning, fromCache: true });
    }
  } catch { /* ignore */ }
  // Absolute fallback: empty
  return NextResponse.json({
    licenses: [],
    lastSynced: null,
    totalAnnual: 0,
    totalMonthly: 0,
    warning,
    fromCache: false,
  });
}
