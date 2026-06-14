'use client';
import { useState } from 'react';
import { getApiUrl, getGoogleAuthUrl } from '../lib/api';

type Status = 'idle' | 'warming' | 'redirecting';

const LABEL: Record<Status, string> = {
  idle: '',
  warming: 'Warming up...',
  redirecting: 'Redirecting...',
};

export function GoogleAuthButton({
  label = 'Sign in with Google',
  className = 'btn-primary',
  style,
}: {
  label?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const [status, setStatus] = useState<Status>('idle');

  async function handleClick() {
    setStatus('warming');
    await waitForApi(getApiUrl());
    setStatus('redirecting');
    window.location.assign(getGoogleAuthUrl());
  }

  return (
    <button
      className={className}
      onClick={handleClick}
      disabled={status !== 'idle'}
      style={style}
    >
      {status !== 'idle' ? LABEL[status] : label}
    </button>
  );
}

// Polls /api/health (via Next.js proxy) until the API responds 200.
// Gives up after ~60 s and lets the redirect proceed anyway.
async function waitForApi(apiUrl: string, maxWaitMs = 60_000, intervalMs = 2_000): Promise<void> {
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${apiUrl}/health`, { signal: AbortSignal.timeout(4_000) });
      if (res.ok) return;
    } catch {
      // network error or timeout — keep retrying
    }
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    await new Promise((r) => setTimeout(r, Math.min(intervalMs, remaining)));
  }
}
