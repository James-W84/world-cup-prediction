'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '../../../store/auth';
import {
  getLeague, getLeaderboard, getJoinRequests, approveRequest, denyRequest, removeMember, deleteLeague,
  League, LeaderboardEntry, JoinRequest,
} from '../../../lib/api';

export default function LeaguePage() {
  const { id } = useParams<{ id: string }>();
  const { user, initialized } = useAuth();
  const router = useRouter();

  const [league, setLeague] = useState<League | null>(null);
  const [board, setBoard] = useState<LeaderboardEntry[]>([]);
  const [pagination, setPagination] = useState({ page: 0, hasMore: false, total: 0 });
  const [joinRequests, setJoinRequests] = useState<JoinRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [toast, setToast] = useState('');
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (initialized && !user) router.replace('/');
  }, [initialized, user, router]);

  useEffect(() => {
    if (!user || !id) return;
    (async () => {
      setLoading(true);
      try {
        const l = await getLeague(id);
        setLeague(l);
        const isMember = l.joinStatus === 'member';
        const [lb, reqs] = await Promise.all([
          isMember ? getLeaderboard(id, 0) : Promise.resolve(null),
          l.isAdmin ? getJoinRequests(id) : Promise.resolve([]),
        ]);
        if (lb) {
          setBoard(lb.leaderboard);
          setPagination({ page: 0, hasMore: lb.pagination.hasMore, total: lb.pagination.total });
        }
        setJoinRequests(reqs);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [user, id]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  }

  async function loadMore() {
    const next = pagination.page + 1;
    try {
      const lb = await getLeaderboard(id, next);
      setBoard((b) => [...b, ...lb.leaderboard]);
      setPagination({ page: next, hasMore: lb.pagination.hasMore, total: lb.pagination.total });
    } catch { /* ignore */ }
  }

  async function handleApprove(req: JoinRequest) {
    setActionLoading((a) => ({ ...a, [req.id]: true }));
    try {
      await approveRequest(id, req.id);
      setJoinRequests((r) => r.filter((x) => x.id !== req.id));
      setPagination((p) => ({ ...p, total: p.total + 1 }));
      showToast(`${req.user.username} approved!`);
      // Refresh leaderboard
      const lb = await getLeaderboard(id, 0);
      setBoard(lb.leaderboard);
      setPagination((p) => ({ ...p, page: 0, hasMore: lb.pagination.hasMore, total: lb.pagination.total }));
    } catch (err: any) {
      showToast(err.message || 'Failed to approve');
    } finally {
      setActionLoading((a) => ({ ...a, [req.id]: false }));
    }
  }

  async function handleDeny(req: JoinRequest) {
    setActionLoading((a) => ({ ...a, [req.id]: true }));
    try {
      await denyRequest(id, req.id);
      setJoinRequests((r) => r.filter((x) => x.id !== req.id));
      showToast(`${req.user.username}'s request denied.`);
    } catch (err: any) {
      showToast(err.message || 'Failed to deny');
    } finally {
      setActionLoading((a) => ({ ...a, [req.id]: false }));
    }
  }

  async function handleRemove(memberId: string, username: string) {
    if (!confirm(`Remove ${username} from this league?`)) return;
    setActionLoading((a) => ({ ...a, [memberId]: true }));
    try {
      await removeMember(id, memberId);
      setBoard((b) => b.filter((e) => e.userId !== memberId));
      setPagination((p) => ({ ...p, total: Math.max(0, p.total - 1) }));
      showToast(`${username} removed.`);
    } catch (err: any) {
      showToast(err.message || 'Failed to remove');
    } finally {
      setActionLoading((a) => ({ ...a, [memberId]: false }));
    }
  }

  function copyInvite() {
    if (!league) return;
    const url = typeof window !== 'undefined' ? window.location.origin : '';
    const text = `Join my World Cup 2026 Predictor league "${league.name}"!\n\n1. Sign up at ${url}\n2. Go to Leagues and click "Join a League"\n3. Enter invite code: ${league.inviteCode}`;
    navigator.clipboard.writeText(text);
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
  const isPending = league.joinStatus === 'pending';

  return (
    <div className="container">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
        <Link href="/leagues" style={{ color: 'var(--muted)', fontSize: 13 }}>← Leagues</Link>
      </div>

      <div className="league-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h1 style={{ marginBottom: 4 }}>{league.name}</h1>
            {league.isAdmin && (
              <span className="badge badge-info" style={{ fontSize: 11 }}>Admin</span>
            )}
          </div>
          <span style={{ color: 'var(--muted)', fontSize: 13 }}>{pagination.total} member{pagination.total !== 1 ? 's' : ''}</span>
        </div>
        <div className="league-actions" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="btn-secondary" onClick={copyInvite} style={{ fontSize: 13 }}>
            {copied ? '✓ Copied!' : 'Copy invite'}
          </button>
          {!isPending && (
            <Link href="/predictions">
              <button className="btn-primary">Make Predictions</button>
            </Link>
          )}
          {league.isAdmin && (
            <button
              className="btn-secondary"
              style={{ fontSize: 13, color: 'var(--danger)', borderColor: 'var(--danger)' }}
              onClick={async () => {
                if (!confirm(`Delete league "${league.name}"? This cannot be undone.`)) return;
                try {
                  await deleteLeague(id);
                  router.push('/leagues');
                } catch (err: any) {
                  showToast(err.message || 'Failed to delete league');
                }
              }}
            >
              Delete League
            </button>
          )}
        </div>
      </div>

      {/* Pending state */}
      {isPending && (
        <div className="card" style={{ marginBottom: 16, borderColor: 'var(--warning)', background: '#1a1200' }}>
          <p style={{ color: 'var(--warning)', margin: 0 }}>
            Your join request is pending admin approval. You'll be able to view the leaderboard once approved.
          </p>
        </div>
      )}

      {/* Admin: pending join requests */}
      {league.isAdmin && joinRequests.length > 0 && (
        <div className="card" style={{ marginBottom: 20, borderColor: 'var(--accent)', background: 'rgba(59,130,246,0.04)' }}>
          <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600 }}>
            Join Requests ({joinRequests.length})
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {joinRequests.map((req) => (
              <div key={req.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ fontWeight: 500, fontSize: 14 }}>{req.user.username}</span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    className="btn-primary"
                    style={{ fontSize: 12, padding: '4px 12px' }}
                    onClick={() => handleApprove(req)}
                    disabled={actionLoading[req.id]}
                  >
                    {actionLoading[req.id] ? <span className="spinner" /> : 'Approve'}
                  </button>
                  <button
                    className="btn-secondary"
                    style={{ fontSize: 12, padding: '4px 12px', color: 'var(--danger)', borderColor: 'var(--danger)' }}
                    onClick={() => handleDeny(req)}
                    disabled={actionLoading[req.id]}
                  >
                    Deny
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!isPending && (
        <>
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
                  {league.isAdmin && <th style={{ padding: '10px 16px', width: 40 }} />}
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
                    {league.isAdmin && (
                      <td style={{ padding: '12px 16px' }}>
                        {entry.userId !== user?.id && (
                          <button
                            onClick={() => handleRemove(entry.userId, entry.username)}
                            disabled={actionLoading[entry.userId]}
                            style={{
                              background: 'none', border: 'none', cursor: 'pointer',
                              color: 'var(--muted)', fontSize: 16, padding: '2px 4px',
                              lineHeight: 1,
                            }}
                            title={`Remove ${entry.username}`}
                          >
                            {actionLoading[entry.userId] ? <span className="spinner" style={{ width: 12, height: 12 }} /> : '×'}
                          </button>
                        )}
                      </td>
                    )}
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
        </>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
