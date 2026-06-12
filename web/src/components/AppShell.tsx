'use client';
import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '../store/auth';
import { GoogleAuthButton } from './GoogleAuthButton';

const NAV_ITEMS = [
  { href: '/',            label: 'Home',       icon: '🏠' },
  { href: '/predictions', label: 'Predictions', icon: '📋' },
  { href: '/leagues',     label: 'Leagues',     icon: '🏆' },
  { href: '/matches',     label: 'Matches',     icon: '⚽' },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, loading, initialized, initialize, logout } = useAuth();
  const pathname = usePathname();

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
                {NAV_ITEMS.map(({ href, label }) => (
                  <Link key={href} href={href}>{label}</Link>
                ))}
                <span style={{ color: 'var(--muted)', fontSize: 13 }}>{user.username}</span>
                <button className="btn-secondary" onClick={logout} style={{ padding: '4px 12px' }}>
                  Logout
                </button>
              </>
            ) : (
              !loading && <GoogleAuthButton />
            )}
          </div>
        </div>
      </nav>

      <main style={{ padding: '24px 0' }} className={user ? 'has-bottom-nav' : ''}>
        {children}
      </main>

      {user && (
        <nav className="bottom-nav" aria-label="Main navigation">
          {NAV_ITEMS.map(({ href, label, icon }) => {
            const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
            return (
              <Link key={href} href={href} className={`bottom-nav-item${active ? ' active' : ''}`}>
                <span className="bottom-nav-icon">{icon}</span>
                <span className="bottom-nav-label">{label}</span>
              </Link>
            );
          })}
          <button className="bottom-nav-item" onClick={logout} aria-label="Logout">
            <span className="bottom-nav-icon">↩</span>
            <span className="bottom-nav-label">Logout</span>
          </button>
        </nav>
      )}
    </>
  );
}
