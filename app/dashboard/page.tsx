'use client';
import { useSession, signOut } from 'next-auth/react';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';

interface License {
  id: string;
  name: string;
  category: string;
  seats: number;
  totalMonthlyCost: number;
  annualCost: number;
  renewalDate: string;
  status: string;
  reviewFlag?: string;
  notes: string;
}

interface SyncData {
  licenses: License[];
  lastSynced: string | null;
  totalAnnual: number;
  totalMonthly: number;
  warning?: string;
  fromCache?: boolean;
}

interface QBStatus {
  realmId: string | null;
  lastSynced: string | null;
  configured: boolean;
}

const categoryColors: Record<string, string> = {
  'Finance': '#f59e0b', 'Marketing': '#ec4899', 'Communication': '#10b981',
  'Infrastructure': '#3b82f6', 'Productivity': '#8b5cf6', 'Dev Tools': '#06b6d4',
  'Design': '#f97316', 'AI': '#7c6fff', 'Other': '#6b7280',
};

function Spinner() {
  return (
    <span style={{ display: 'inline-block', width: 14, height: 14, border: '2px solid rgba(124,111,255,0.3)', borderTopColor: '#7c6fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite', marginRight: 6 }} />
  );
}

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [licenses, setLicenses] = useState<License[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [lastSynced, setLastSynced] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(false);

  const [showSettings, setShowSettings] = useState(false);
  const [qbStatus, setQBStatus] = useState<QBStatus | null>(null);
  const [settingsForm, setSettingsForm] = useState({ clientId: '', clientSecret: '', tenantId: '' });
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsMsg, setSettingsMsg] = useState<string | null>(null);

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login');
  }, [status, router]);

  const fetchData = useCallback(async (force = false) => {
    const url = force ? '/api/quickbooks/sync?force=1' : '/api/quickbooks/sync';
    if (force) setSyncing(true); else setLoading(true);
    try {
      const res = await fetch(url);
      const d: SyncData = await res.json();
      setLicenses(d.licenses || []);
      setLastSynced(d.lastSynced || null);
      setWarning(d.warning || null);
      setFromCache(d.fromCache || false);
    } catch (e) {
      setWarning('Failed to fetch data.');
    } finally {
      setSyncing(false);
      setLoading(false);
    }
  }, []);

  const loadQBStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/quickbooks/settings');
      setQBStatus(await res.json());
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (status === 'authenticated') {
      fetchData();
      loadQBStatus();
    }
  }, [status, fetchData, loadQBStatus]);

  const handleSaveSettings = async () => {
    setSettingsSaving(true);
    setSettingsMsg(null);
    try {
      const res = await fetch('/api/quickbooks/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settingsForm),
      });
      const data = await res.json();
      if (data.authUrl) {
        setSettingsMsg('Settings saved! Redirecting to QuickBooks OAuth...');
        setTimeout(() => window.open(data.authUrl, '_blank'), 1500);
      } else {
        setSettingsMsg(data.error || 'Saved.');
      }
      await loadQBStatus();
    } catch (e) {
      setSettingsMsg('Failed to save settings.');
    } finally {
      setSettingsSaving(false);
    }
  };

  if (status === 'loading' || loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#0d0d14', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666688', fontFamily: 'Inter, sans-serif' }}>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <Spinner /> Loading...
      </div>
    );
  }

  const totalAnnual = licenses.reduce((s, l) => s + l.annualCost, 0);
  const totalMonthly = licenses.reduce((s, l) => s + l.totalMonthlyCost, 0);
  const flagged = licenses.filter(l => l.reviewFlag);
  const soon = licenses.filter(l => {
    if (!l.renewalDate) return false;
    const days = (new Date(l.renewalDate).getTime() - Date.now()) / 86400000;
    return days >= 0 && days <= 30;
  });

  const s: Record<string, any> = {
    body: { margin: 0, fontFamily: 'Inter, sans-serif', background: '#0d0d14', color: '#e8e8f0', minHeight: '100vh' },
    nav: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 40px', borderBottom: '1px solid rgba(255,255,255,0.07)' },
    logo: { fontSize: '1.1rem', fontWeight: 700, background: 'linear-gradient(90deg,#7c6fff,#a78bfa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' },
    main: { padding: '32px 40px', maxWidth: 1200, margin: '0 auto' },
    statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginBottom: 28 },
    statCard: { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '20px 24px' },
    statLabel: { fontSize: '0.72rem', color: '#666688', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 },
    statValue: { fontSize: '1.8rem', fontWeight: 700 },
    table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: '0.84rem' },
    th: { textAlign: 'left' as const, padding: '10px 14px', color: '#555577', fontSize: '0.72rem', textTransform: 'uppercase' as const, letterSpacing: '0.06em', fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,0.07)' },
    td: { padding: '12px 14px', borderBottom: '1px solid rgba(255,255,255,0.04)', color: '#ccccdd' },
    btn: { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#aaa', padding: '5px 12px', borderRadius: 6, cursor: 'pointer', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: 4 },
  };

  const formattedSync = lastSynced
    ? new Date(lastSynced).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : 'Never';

  return (
    <div style={s.body}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <nav style={s.nav}>
        <div style={s.logo}>✦ Spark Benjamin</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: '0.85rem', color: '#666688' }}>
          <span>{session?.user?.name}</span>
          <button onClick={() => signOut({ callbackUrl: '/login' })} style={s.btn}>Sign out</button>
        </div>
      </nav>

      <div style={s.main}>
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: 4 }}>License Dashboard</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <p style={{ color: '#666688', fontSize: '0.85rem', margin: 0 }}>
              v.two · {licenses.length} active licenses
              {fromCache && <span style={{ color: '#555577', marginLeft: 8 }}>(cached)</span>}
            </p>
            <span style={{ color: '#444466', fontSize: '0.8rem' }}>Last synced: {formattedSync}</span>
            <button
              onClick={() => fetchData(true)}
              disabled={syncing}
              style={{ ...s.btn, color: syncing ? '#555' : '#a78bfa', borderColor: 'rgba(124,111,255,0.3)' }}
            >
              {syncing ? <Spinner /> : '↻'} Update Now
            </button>
            <button
              onClick={() => { setShowSettings(true); loadQBStatus(); }}
              style={{ ...s.btn }}
            >
              ⚙ QuickBooks Settings
            </button>
          </div>
          {warning && (
            <div style={{ marginTop: 10, background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)', borderRadius: 8, padding: '8px 14px', fontSize: '0.82rem', color: '#fbbf24' }}>
              ⚠ {warning}
            </div>
          )}
        </div>

        {/* Stats */}
        <div style={s.statsGrid}>
          <div style={{ ...s.statCard, borderColor: 'rgba(124,111,255,0.3)', background: 'rgba(124,111,255,0.08)' }}>
            <div style={s.statLabel}>Annual Spend</div>
            <div style={{ ...s.statValue, background: 'linear-gradient(135deg,#7c6fff,#c4b5fd)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>${totalAnnual.toLocaleString('en-US', { maximumFractionDigits: 0 })}</div>
          </div>
          <div style={s.statCard}>
            <div style={s.statLabel}>Monthly Spend</div>
            <div style={s.statValue}>${totalMonthly.toLocaleString('en-US', { maximumFractionDigits: 0 })}</div>
          </div>
          <div style={s.statCard}>
            <div style={s.statLabel}>Renewing Soon</div>
            <div style={{ ...s.statValue, color: '#fbbf24' }}>{soon.length}</div>
          </div>
          <div style={s.statCard}>
            <div style={s.statLabel}>Flagged for Review</div>
            <div style={{ ...s.statValue, color: '#f87171' }}>{flagged.length}</div>
          </div>
        </div>

        {/* Flags */}
        {flagged.length > 0 && (
          <div style={{ marginBottom: 28, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {flagged.map(l => (
              <div key={l.id} style={{ background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '10px 16px', fontSize: '0.82rem', color: '#f87171' }}>
                🚩 <strong>{l.name}</strong> — {l.reviewFlag}
              </div>
            ))}
          </div>
        )}

        {/* Table */}
        <div style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 16 }}>All Licenses</div>
        <table style={s.table}>
          <thead>
            <tr>
              {['Name', 'Category', 'Seats', 'Monthly', 'Annual', 'Renewal', 'Status'].map(h => (
                <th key={h} style={s.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...licenses].sort((a, b) => b.annualCost - a.annualCost).map(l => (
              <tr key={l.id}>
                <td style={s.td}>
                  <div>{l.name}</div>
                  {l.reviewFlag && <div style={{ fontSize: '0.72rem', color: '#f87171', marginTop: 2 }}>{l.reviewFlag}</div>}
                </td>
                <td style={s.td}>
                  <span style={{ background: `${categoryColors[l.category] || '#6b7280'}22`, color: categoryColors[l.category] || '#6b7280', padding: '2px 10px', borderRadius: 100, fontSize: '0.72rem', fontWeight: 600 }}>
                    {l.category}
                  </span>
                </td>
                <td style={s.td}>{l.seats > 1 ? `~${l.seats}` : '—'}</td>
                <td style={{ ...s.td, fontWeight: 600, color: '#e8e8f0' }}>${l.totalMonthlyCost.toLocaleString('en-US', { maximumFractionDigits: 0 })}</td>
                <td style={{ ...s.td, fontWeight: 600, color: '#e8e8f0' }}>${l.annualCost.toLocaleString('en-US', { maximumFractionDigits: 0 })}</td>
                <td style={s.td}>{l.renewalDate || '—'}</td>
                <td style={s.td}>
                  <span style={{
                    background: l.status === 'active' ? 'rgba(34,197,94,0.15)' : 'rgba(251,191,36,0.15)',
                    color: l.status === 'active' ? '#4ade80' : '#fbbf24',
                    padding: '2px 10px', borderRadius: 100, fontSize: '0.72rem', fontWeight: 600
                  }}>
                    {l.reviewFlag ? 'Review' : l.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* QuickBooks Settings Modal */}
      {showSettings && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowSettings(false); }}
        >
          <div style={{ background: '#14141f', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: 32, width: 480, maxWidth: '90vw' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <div style={{ fontWeight: 700, fontSize: '1rem' }}>⚙ QuickBooks Settings</div>
              <button onClick={() => setShowSettings(false)} style={{ background: 'none', border: 'none', color: '#666688', cursor: 'pointer', fontSize: '1.2rem' }}>✕</button>
            </div>

            {/* Connection status */}
            <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: '14px 18px', marginBottom: 24, fontSize: '0.83rem' }}>
              <div style={{ color: '#666688', marginBottom: 8, fontWeight: 600, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Connection Status</div>
              <div style={{ color: '#ccccdd', marginBottom: 4 }}>
                Realm ID: <span style={{ color: qbStatus?.realmId ? '#a78bfa' : '#555577' }}>{qbStatus?.realmId || 'Not configured'}</span>
              </div>
              <div style={{ color: '#ccccdd', marginBottom: 4 }}>
                Last synced: <span style={{ color: '#aaa' }}>{qbStatus?.lastSynced ? new Date(qbStatus.lastSynced).toLocaleString() : 'Never'}</span>
              </div>
              <div style={{ marginTop: 8 }}>
                <span style={{
                  background: qbStatus?.configured ? 'rgba(34,197,94,0.15)' : 'rgba(251,191,36,0.15)',
                  color: qbStatus?.configured ? '#4ade80' : '#fbbf24',
                  padding: '2px 10px', borderRadius: 100, fontSize: '0.72rem', fontWeight: 600,
                }}>
                  {qbStatus?.configured ? '● Connected' : '○ Not configured'}
                </span>
              </div>
            </div>

            {/* Form */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 20 }}>
              {(['clientId', 'clientSecret', 'tenantId'] as const).map((field) => (
                <div key={field}>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: '#666688', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                    {field === 'clientId' ? 'Client ID' : field === 'clientSecret' ? 'Client Secret' : 'Tenant (Realm) ID'}
                  </label>
                  <input
                    type={field === 'clientSecret' ? 'password' : 'text'}
                    value={settingsForm[field]}
                    onChange={e => setSettingsForm(f => ({ ...f, [field]: e.target.value }))}
                    placeholder={`Enter ${field === 'tenantId' ? 'Realm/Tenant ID' : field}`}
                    style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '8px 12px', color: '#e8e8f0', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>
              ))}
            </div>

            {settingsMsg && (
              <div style={{ marginBottom: 16, fontSize: '0.82rem', color: '#a78bfa' }}>{settingsMsg}</div>
            )}

            <button
              onClick={handleSaveSettings}
              disabled={settingsSaving}
              style={{ width: '100%', background: 'linear-gradient(135deg,#7c6fff,#a78bfa)', border: 'none', color: '#fff', padding: '10px 0', borderRadius: 8, cursor: settingsSaving ? 'wait' : 'pointer', fontWeight: 600, fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
            >
              {settingsSaving && <Spinner />}
              Reconnect QuickBooks
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
