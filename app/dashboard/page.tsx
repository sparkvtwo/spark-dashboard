'use client';
import { useSession, signOut } from 'next-auth/react';
import { useEffect, useState } from 'react';
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

const categoryColors: Record<string, string> = {
  'Finance': '#f59e0b', 'Marketing': '#ec4899', 'Communication': '#10b981',
  'Infrastructure': '#3b82f6', 'Productivity': '#8b5cf6', 'Dev Tools': '#06b6d4',
  'Design': '#f97316', 'AI': '#7c6fff', 'Other': '#6b7280',
};

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [licenses, setLicenses] = useState<License[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login');
  }, [status, router]);

  useEffect(() => {
    if (status === 'authenticated') {
      fetch('/api/licenses')
        .then(r => r.json())
        .then(d => { setLicenses(d.licenses || []); setLoading(false); })
        .catch(() => setLoading(false));
    }
  }, [status]);

  if (status === 'loading' || loading) {
    return <div style={{ minHeight: '100vh', background: '#0d0d14', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666688', fontFamily: 'Inter, sans-serif' }}>Loading...</div>;
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
  };

  return (
    <div style={s.body}>
      <nav style={s.nav}>
        <div style={s.logo}>✦ Spark Benjamin</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: '0.85rem', color: '#666688' }}>
          <span>{session?.user?.name}</span>
          <button onClick={() => signOut({ callbackUrl: '/login' })} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#aaa', padding: '6px 14px', borderRadius: 6, cursor: 'pointer', fontSize: '0.82rem' }}>Sign out</button>
        </div>
      </nav>

      <div style={s.main}>
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: 4 }}>License Dashboard</h1>
          <p style={{ color: '#666688', fontSize: '0.85rem' }}>v.two · {licenses.length} active licenses</p>
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
    </div>
  );
}
