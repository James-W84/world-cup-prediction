'use client';
import { useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '../store/auth';
import { GoogleAuthButton } from './GoogleAuthButton';

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, loading, initialized, initialize, logout } = useAuth();

  useEffect(() => {
    if (!initialized) initialize();
  }, [initialized, initialize]);

  return (
    <>
      <nav>
        <div className="inner">
          <Link href="/" className="logo">⚽ WC 2026</Link>
          <div className="nav-links">
            {user ? (
              <>
                <Link href="/">Home</Link>
                <Link href="/predictions">Predictions</Link>
                <Link href="/leagues">Leagues</Link>
                <Link href="/matches">Matches</Link>
                <span style={{ color: 'var(--muted)', fontSize: 13 }}>{user.username}</span>
                <button className="btn-secondary" onClick={logout} style={{ padding: '4px 12px' }}>
                  Logout
                </button>
              </>
            ) : (
              !loading && (
                <GoogleAuthButton />
              )
            )}
          </div>
        </div>
      </nav>
      <main style={{ padding: '24px 0' }}>{children}</main>
    </>
  );
}
