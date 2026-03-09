'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * First-run setup wizard.
 * Shown automatically when a user is authenticated but QuickBooks is not yet connected.
 * The only action required is clicking "Connect QuickBooks" — no credentials to enter.
 */
export default function SetupPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [appReady, setAppReady] = useState(false);
  const [qbError, setQbError] = useState<string | null>(null);

  useEffect(() => {
    // Show any error from a failed OAuth attempt
    const params = new URLSearchParams(window.location.search);
    const err = params.get('qb_error');
    if (err) {
      setQbError(err.replace(/_/g, ' '));
      window.history.replaceState({}, '', '/setup');
    }

    // If QB is already connected, skip straight to dashboard
    fetch('/api/quickbooks/settings')
      .then(r => r.json())
      .then(data => {
        if (data.configured) {
          router.replace('/dashboard');
          return;
        }
        setAppReady(!data.missingAppCredentials);
        setChecking(false);
      })
      .catch(() => setChecking(false));
  }, [router]);

  if (checking) {
    return (
      <div style={styles.center}>
        <div style={styles.spinner} />
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
      `}</style>

      <div style={styles.card}>
        <div style={styles.logo}>✦ Spark</div>
        <h1 style={styles.heading}>Connect your QuickBooks account</h1>
        <p style={styles.sub}>
          Spark syncs your vendor data from QuickBooks to track software licenses and spend.
          This is a one-time setup — you won't need to do it again.
        </p>

        {qbError && (
          <div style={{ ...styles.errorBox, marginBottom: 16 }}>
            Connection failed: {qbError}. Please try again.
          </div>
        )}

        {appReady ? (
          <button
            onClick={() => { window.location.href = '/api/quickbooks/authorize'; }}
            style={styles.cta}
          >
            Connect QuickBooks →
          </button>
        ) : (
          <div style={styles.errorBox}>
            <strong>App not configured.</strong> QuickBooks credentials are missing.
            Contact your administrator.
          </div>
        )}

        <p style={styles.hint}>
          You'll be redirected to Intuit to authorize access, then brought back here automatically.
        </p>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: '#0d0d14',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: 'Inter, sans-serif',
    padding: '20px',
    animation: 'fadeIn 0.3s ease',
  },
  center: {
    minHeight: '100vh',
    background: '#0d0d14',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  spinner: {
    width: 24,
    height: 24,
    border: '2px solid rgba(124,111,255,0.3)',
    borderTopColor: '#7c6fff',
    borderRadius: '50%',
    animation: 'spin 0.7s linear infinite',
  },
  card: {
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 20,
    padding: '48px 40px',
    maxWidth: 480,
    width: '100%',
    textAlign: 'center',
    color: '#e8e8f0',
  },
  logo: {
    fontSize: '1.4rem',
    fontWeight: 700,
    background: 'linear-gradient(90deg,#7c6fff,#a78bfa)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    marginBottom: 28,
  },
  heading: {
    fontSize: '1.5rem',
    fontWeight: 700,
    margin: '0 0 12px',
    lineHeight: 1.3,
  },
  sub: {
    fontSize: '0.9rem',
    color: '#888899',
    lineHeight: 1.7,
    margin: '0 0 32px',
  },
  cta: {
    display: 'inline-block',
    background: 'linear-gradient(135deg,#7c6fff,#a78bfa)',
    color: '#fff',
    border: 'none',
    borderRadius: 10,
    padding: '14px 32px',
    fontSize: '0.95rem',
    fontWeight: 600,
    cursor: 'pointer',
    width: '100%',
    marginBottom: 20,
  },
  errorBox: {
    background: 'rgba(239,68,68,0.08)',
    border: '1px solid rgba(239,68,68,0.25)',
    borderRadius: 8,
    padding: '12px 16px',
    fontSize: '0.85rem',
    color: '#f87171',
    marginBottom: 20,
  },
  hint: {
    fontSize: '0.78rem',
    color: '#444466',
    margin: 0,
    lineHeight: 1.6,
  },
};
