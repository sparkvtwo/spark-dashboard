'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function QBSuccessPage() {
  const searchParams = useSearchParams();
  const [copied, setCopied] = useState(false);
  
  const realmId = searchParams.get('realmId') || '';
  const refreshToken = searchParams.get('refreshToken') || '';

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!realmId || !refreshToken) {
    return (
      <div style={{ 
        minHeight: '100vh', 
        background: '#0d0d14', 
        color: '#e8e8f0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'Inter, sans-serif'
      }}>
        <div style={{ textAlign: 'center' }}>
          <h1>Error: Missing Token Information</h1>
          <p>Please try connecting to QuickBooks again.</p>
          <a href="/dashboard" style={{ color: '#7c6fff' }}>Go to Dashboard</a>
        </div>
      </div>
    );
  }

  return (
    <div style={{ 
      minHeight: '100vh', 
      background: '#0d0d14', 
      color: '#e8e8f0',
      padding: '40px 20px',
      fontFamily: 'Inter, sans-serif'
    }}>
      <div style={{ maxWidth: 800, margin: '0 auto' }}>
        <h1 style={{ color: '#7c6fff', marginBottom: 30 }}>✦ QuickBooks Connected!</h1>
        
        <div style={{ 
          background: 'rgba(255,255,255,0.05)', 
          borderRadius: 12, 
          padding: 24,
          marginBottom: 24,
          border: '1px solid rgba(255,255,255,0.1)'
        }}>
          <h2 style={{ marginTop: 0 }}>Add These to Railway Environment Variables:</h2>
          
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', marginBottom: 8, color: '#a78bfa' }}>
              QB_REALM_ID
            </label>
            <div style={{ display: 'flex', gap: 10 }}>
              <code style={{ 
                flex: 1,
                background: '#1a1a2e', 
                padding: '12px 16px', 
                borderRadius: 8,
                fontSize: '14px',
                wordBreak: 'break-all'
              }}>
                {realmId}
              </code>
              <button 
                onClick={() => copyToClipboard(realmId)}
                style={{
                  padding: '12px 24px',
                  background: '#7c6fff',
                  border: 'none',
                  borderRadius: 8,
                  color: 'white',
                  cursor: 'pointer',
                  fontWeight: 600
                }}
              >
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', marginBottom: 8, color: '#a78bfa' }}>
              QB_REFRESH_TOKEN
            </label>
            <div style={{ display: 'flex', gap: 10 }}>
              <code style={{ 
                flex: 1,
                background: '#1a1a2e', 
                padding: '12px 16px', 
                borderRadius: 8,
                fontSize: '12px',
                wordBreak: 'break-all'
              }}>
                {refreshToken}
              </code>
              <button 
                onClick={() => copyToClipboard(refreshToken)}
                style={{
                  padding: '12px 24px',
                  background: '#7c6fff',
                  border: 'none',
                  borderRadius: 8,
                  color: 'white',
                  cursor: 'pointer',
                  fontWeight: 600
                }}
              >
                Copy
              </button>
            </div>
          </div>
        </div>

        <div style={{ 
          background: 'rgba(124,111,255,0.1)', 
          borderRadius: 12, 
          padding: 24,
          border: '1px solid rgba(124,111,255,0.3)'
        }}>
          <h3 style={{ marginTop: 0, color: '#7c6fff' }}>Next Steps:</h3>
          <ol style={{ lineHeight: 1.8 }}>
            <li>Go to your <a href="https://railway.app" target="_blank" rel="noopener" style={{ color: '#7c6fff' }}>Railway Dashboard</a></li>
            <li>Find your spark-dashboard project</li>
            <li>Go to the <strong>Variables</strong> tab</li>
            <li>Add the two variables above (QB_REALM_ID and QB_REFRESH_TOKEN)</li>
            <li>Click <strong>Redeploy</strong></li>
            <li>Return to your dashboard — QuickBooks sync should work!</li>
          </ol>
        </div>

        <div style={{ marginTop: 30, textAlign: 'center' }}>
          <a href="/dashboard" style={{ color: '#7c6fff' }}>← Back to Dashboard</a>
        </div>
      </div>
    </div>
  );
}
