'use client';
import { useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '../store/auth';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

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
                <a href={`${API_URL}/auth/google`}>
                  <button className="btn-primary">Sign in with Google</button>
                </a>
              )
            )}
          </div>
        </div>
      </nav>
      <main style={{ padding: '24px 0' }}>{children}</main>
    </>
  );
}
