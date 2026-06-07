'use client';
import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '../../../store/auth';

export default function AuthCallbackPage() {
  const router = useRouter();
  const params = useSearchParams();
  const { initialize } = useAuth();

  useEffect(() => {
    const success = params.get('success');
    if (success === 'true') {
      initialize().then(() => router.replace('/'));
    } else {
      router.replace('/?error=auth');
    }
  }, [params, initialize, router]);

  return (
    <div className="container" style={{ textAlign: 'center', paddingTop: 80 }}>
      <div className="spinner" />
      <p style={{ marginTop: 16, color: 'var(--muted)' }}>Signing you in…</p>
    </div>
  );
}
