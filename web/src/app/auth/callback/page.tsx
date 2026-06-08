'use client';
import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '../../../store/auth';

export const dynamic = 'force-dynamic';

function AuthCallback() {
  const router = useRouter();
  const params = useSearchParams();
  const { initialize } = useAuth();

  useEffect(() => {
    const success = params.get('success');
    if (success === 'true') {
      initialize().then((user) => router.replace(user ? '/' : '/?error=session'));
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

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={<div className="container" style={{ textAlign: 'center', paddingTop: 80 }}><div className="spinner" /></div>}>
      <AuthCallback />
    </Suspense>
  );
}
