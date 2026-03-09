import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getCredentials, refreshAccessToken as qbRefresh } from '@/lib/qb-token-store';

const CACHE_FILE = path.join(process.cwd(), 'data', 'licenses-cache.json');
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// ─── Vendor categorization ────────────────────────────────────────────────────

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

interface QBVendor {
  Id: string;
  DisplayName?: string;
  CompanyName?: string;
  GivenName?: string;
  FamilyName?: string;
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

function vendorsToLicenses(vendors: QBVendor[]): LicenseEntry[] {
  const now = new Date();
  const renewalDate = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString().split('T')[0];
  const addedDate = now.toISOString().split('T')[0];
  const owner = 'chris@vtwo.co';

  return vendors.map((vendor) => {
    const vendorRaw = vendor.DisplayName || vendor.CompanyName || `${vendor.GivenName || ''} ${vendor.FamilyName || ''}`.trim() || 'Unknown';
    const { name, category } = categorizeVendor(vendorRaw);
    const id = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);

    let reviewFlag: string | undefined;
    if (name === '650 Industries') reviewFlag = 'Unknown vendor — needs identification';

    return {
      id,
      name,
      vendor: name,
      category,
      seats: 1,
      costPerSeat: 0,
      totalMonthlyCost: 0,
      billingCycle: 'monthly',
      annualCost: 0,
      renewalDate,
      owner,
      notes: `Imported from QuickBooks (Vendor).`,
      status: 'active',
      addedDate,
      ...(reviewFlag ? { reviewFlag } : {}),
    };
  });
}

// ─── QB query ─────────────────────────────────────────────────────────────────

async function qbQuery(
  sql: string,
  accessToken: string,
  realmId: string,
  retryWithRefresh?: () => Promise<string>
): Promise<{ data: unknown; intuitTid: string }> {
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
    console.log('[QB] Access token expired, refreshing...');
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

// ─── Route handler ────────────────────────────────────────────────────────────

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

  // Load credentials from centralised token store
  const creds = getCredentials();
  if (!creds) {
    return serveCachedOrSeed('QuickBooks credentials not configured.');
  }

  let accessToken = creds.accessToken || '';

  // Token refresh helper — also handles rotation persistence via token store
  const doRefresh = async (): Promise<string> => {
    const result = await qbRefresh(creds);
    accessToken = result.accessToken;
    // Update creds.refreshToken in-place for any subsequent retries
    creds.refreshToken = result.refreshToken;
    return accessToken;
  };

  // Ensure we have an access token
  if (!accessToken) {
    try {
      accessToken = await doRefresh();
    } catch (e) {
      console.error('[QB Sync] Token refresh failed:', e);
      return serveCachedOrSeed(`Token refresh failed: ${e}`);
    }
  }

  try {
    const sql = `SELECT * FROM Vendor MAXRESULTS 1000`;
    const { data } = await qbQuery(sql, accessToken, creds.realmId, doRefresh);
    const vendors: QBVendor[] = (data as any)?.QueryResponse?.Vendor || [];
    console.log(`[QB] Fetched ${vendors.length} vendors`);

    const licenses = vendorsToLicenses(vendors);
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
  return NextResponse.json({
    licenses: [],
    lastSynced: null,
    totalAnnual: 0,
    totalMonthly: 0,
    warning,
    fromCache: false,
  });
}
