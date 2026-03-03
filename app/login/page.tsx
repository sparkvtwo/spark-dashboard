'use client';
import { signIn } from 'next-auth/react';

export default function LoginPage() {
  return (
    <div style={{
      minHeight: '100vh', background: '#0d0d14', display: 'flex',
      alignItems: 'center', justifyContent: 'center', fontFamily: 'Inter, sans-serif'
    }}>
      <div style={{
        background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 16, padding: '48px 40px', textAlign: 'center', maxWidth: 380, width: '100%'
      }}>
        <div style={{ fontSize: '2rem', marginBottom: 12 }}>✦</div>
        <h1 style={{ color: '#e8e8f0', fontSize: '1.4rem', fontWeight: 700, marginBottom: 8 }}>
          Spark Benjamin
        </h1>
        <p style={{ color: '#666688', fontSize: '0.88rem', marginBottom: 32 }}>
          Sign in with your v.two Microsoft account to access the license dashboard.
        </p>
        <button
          onClick={() => signIn('azure-ad', { callbackUrl: '/dashboard' })}
          style={{
            width: '100%', padding: '13px 24px', borderRadius: 8, border: 'none',
            background: 'linear-gradient(135deg, #7c6fff, #a78bfa)',
            color: '#fff', fontWeight: 600, fontSize: '0.95rem', cursor: 'pointer'
          }}
        >
          Sign in with Microsoft
        </button>
        <p style={{ color: '#444466', fontSize: '0.75rem', marginTop: 24 }}>
          Access restricted to @vtwo.co accounts
        </p>
      </div>
    </div>
  );
}
