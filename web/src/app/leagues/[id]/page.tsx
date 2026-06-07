'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '../../../store/auth';
import { getLeague, getLeaderboard, League, LeaderboardEntry } from '../../../lib/api';

export default function LeaguePage() {
  const { id } = useParams<{ id: string }>();
  const { user, initialized } = useAuth();
  const router = useRouter();

  const [league, setLeague] = useState<League | null>(null);
  const [board, setBoard] = useState<LeaderboardEntry[]>([]);
  const [pagination, setPagination] = useState({ page: 0, hasMore: false, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (initialized && !user) router.replace('/');
  }, [initialized, user, router]);

  useEffect(() => {
    if (!user || !id) return;
    (async () => {
      setLoading(true);
      try {
        const [l, lb] = await Promise.all([getLeague(id), getLeaderboard(id, 0)]);
        setLeague(l);
        setBoard(lb.leaderboard);
        setPagination({ page: 0, hasMore: lb.pagination.hasMore, total: lb.pagination.total });
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [user, id]);

  async function loadMore() {
    const next = pagination.page + 1;
    try {
      const lb = await getLeaderboard(id, next);
      setBoard((b) => [...b, ...lb.leaderboard]);
      setPagination({ page: next, hasMore: lb.pagination.hasMore, total: lb.pagination.total });
    } catch { /* ignore */ }
  }

  function copyInvite() {
    if (!league) return;
    navigator.clipboard.writeText(league.inviteCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (!initialized || loading) {
    return <div className="container" style={{ paddingTop: 40 }}><div className="spinner" /></div>;
  }

  if (error) {
    return (
      <div className="container" style={{ paddingTop: 40 }}>
        <p style={{ color: 'var(--danger)' }}>{error}</p>
        <Link href="/leagues"><button className="btn-secondary" style={{ marginTop: 12 }}>Back</button></Link>
      </div>
    );
  }

  if (!league) return null;

  const currentUserEntry = board.find((e) => e.userId === user?.id);

  return (
    <div className="container">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
        <Link href="/leagues" style={{ color: 'var(--muted)', fontSize: 13 }}>← Leagues</Link>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <h1 style={{ marginBottom: 4 }}>{league.name}</h1>
          <span style={{ color: 'var(--muted)', fontSize: 13 }}>{pagination.total} member{pagination.total !== 1 ? 's' : ''}</span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="btn-secondary" onClick={copyInvite} style={{ fontSize: 13 }}>
            {copied ? '✓ Copied' : `Invite: ${league.inviteCode}`}
          </button>
          <Link href="/predictions">
            <button className="btn-primary">Make Predictions</button>
          </Link>
        </div>
      </div>

      {currentUserEntry && (
        <div className="card" style={{ marginBottom: 16, display: 'flex', gap: 16, alignItems: 'center' }}>
          <div>
            <div style={{ color: 'var(--muted)', fontSize: 12 }}>Your rank</div>
            <div style={{ fontSize: 24, fontWeight: 700 }}>#{currentUserEntry.rank}</div>
          </div>
          <div>
            <div style={{ color: 'var(--muted)', fontSize: 12 }}>Points</div>
            <div style={{ fontSize: 24, fontWeight: 700 }}>{currentUserEntry.totalPoints}</div>
          </div>
        </div>
      )}

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
              <th style={{ padding: '10px 16px', textAlign: 'left', color: 'var(--muted)', fontWeight: 500, fontSize: 13 }}>Rank</th>
              <th style={{ padding: '10px 16px', textAlign: 'left', color: 'var(--muted)', fontWeight: 500, fontSize: 13 }}>Player</th>
              <th style={{ padding: '10px 16px', textAlign: 'right', color: 'var(--muted)', fontWeight: 500, fontSize: 13 }}>Points</th>
            </tr>
          </thead>
          <tbody>
            {board.map((entry, i) => (
              <tr
                key={entry.userId}
                style={{
                  borderBottom: i < board.length - 1 ? '1px solid var(--border)' : 'none',
                  background: entry.userId === user?.id ? 'rgba(59,130,246,0.08)' : 'transparent',
                }}
              >
                <td style={{ padding: '12px 16px', fontWeight: 700, color: entry.rank <= 3 ? 'var(--warning)' : 'var(--text)' }}>
                  {entry.rank}
                </td>
                <td style={{ padding: '12px 16px' }}>
                  {entry.username}
                  {entry.userId === user?.id && <span style={{ color: 'var(--accent)', fontSize: 11, marginLeft: 6 }}>(you)</span>}
                </td>
                <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600 }}>{entry.totalPoints}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pagination.hasMore && (
        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <button className="btn-secondary" onClick={loadMore}>Load more</button>
        </div>
      )}
    </div>
  );
}
