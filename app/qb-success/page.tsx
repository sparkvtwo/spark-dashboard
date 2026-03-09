'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Legacy route — QuickBooks OAuth now persists tokens automatically via the
 * Railway Variables API and redirects straight to /dashboard?qb_success=true.
 *
 * This page exists only to handle any stale bookmarks or direct visits.
 */
export default function QBSuccessPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/dashboard?qb_success=true');
  }, [router]);

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0d0d14',
      color: '#e8e8f0',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'Inter, sans-serif',
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '2rem', marginBottom: 12 }}>✦</div>
        <div style={{ color: '#666688' }}>Redirecting…</div>
      </div>
    </div>
  );
}
