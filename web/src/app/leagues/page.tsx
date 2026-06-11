'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../store/auth';
import { createLeague, joinLeague, getMyLeagues, LeagueWithStatus } from '../../lib/api';

export default function LeaguesPage() {
  const { user, initialized } = useAuth();
  const router = useRouter();
  const [leagues, setLeagues] = useState<LeagueWithStatus[]>([]);
  const [newName, setNewName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingLeagues, setLoadingLeagues] = useState(true);

  useEffect(() => {
    if (initialized && !user) router.replace('/');
  }, [initialized, user, router]);

  useEffect(() => {
    if (!user) return;
    getMyLeagues()
      .then(setLeagues)
      .catch(() => {})
      .finally(() => setLoadingLeagues(false));
  }, [user]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setLoading(true);
    setError('');
    try {
      const league = await createLeague(newName.trim());
      setLeagues((l) => [{ ...league, joinStatus: 'member', _count: { members: 1 } } as LeagueWithStatus, ...l]);
      setNewName('');
      showToast(`League "${league.name}" created!`);
      router.push(`/leagues/${league.id}`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteCode.trim()) return;
    setLoading(true);
    setError('');
    try {
      const result = await joinLeague(inviteCode.trim().toUpperCase());
      setInviteCode('');
      if (result.joinStatus === 'pending') {
        showToast(`Request to join "${result.league.name}" sent — waiting for admin approval.`);
        // Add to list as pending
        setLeagues((l) => [{ ...result.league, joinStatus: 'pending', _count: { members: 0 } } as LeagueWithStatus, ...l]);
      } else {
        showToast(`Joined "${result.league.name}"!`);
        router.push(`/leagues/${result.league.id}`);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (!initialized || !user) {
    return <div className="container" style={{ paddingTop: 40 }}><div className="spinner" /></div>;
  }

  return (
    <div className="container">
      <h1 style={{ marginBottom: 24 }}>My Leagues</h1>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 32 }}>
        <div className="card">
          <h3 style={{ marginBottom: 4 }}>Create a League</h3>
          <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>
            Create a league and share your invite code with friends so they can join and compete.
          </p>
          <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <input
              placeholder="League name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              maxLength={60}
            />
            <button className="btn-primary" type="submit" disabled={loading || !newName.trim()}>
              {loading ? <span className="spinner" /> : 'Create'}
            </button>
          </form>
        </div>

        <div className="card">
          <h3 style={{ marginBottom: 4 }}>Join a League</h3>
          <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>
            Got an invite code from a friend? Enter it below to request to join their league.
          </p>
          <form onSubmit={handleJoin} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <input
              placeholder="Invite code (e.g. ABC12345)"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
              maxLength={8}
            />
            <button className="btn-primary" type="submit" disabled={loading || !inviteCode.trim()}>
              {loading ? <span className="spinner" /> : 'Request to Join'}
            </button>
          </form>
        </div>
      </div>

      {error && <p style={{ color: 'var(--danger)', marginBottom: 16 }}>{error}</p>}

      {loadingLeagues ? (
        <div style={{ textAlign: 'center', paddingTop: 20 }}><div className="spinner" /></div>
      ) : leagues.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', color: 'var(--muted)', padding: 40 }}>
          No leagues yet. Create one or join with an invite code.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {leagues.map((league) => (
            league.joinStatus === 'pending' ? (
              <div key={league.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', opacity: 0.7 }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{league.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                    Join request pending admin approval
                  </div>
                </div>
                <span className="badge badge-warning">Pending</span>
              </div>
            ) : (
              <Link key={league.id} href={`/leagues/${league.id}`} style={{ textDecoration: 'none' }}>
                <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
                  <div>
                    <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                      {league.name}
                      {league.isAdmin && (league.pendingRequestCount ?? 0) > 0 && (
                        <span className="badge badge-warning" style={{ fontSize: 11 }}>
                          {league.pendingRequestCount} pending
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                      {league._count?.members ?? 0} member{(league._count?.members ?? 1) !== 1 ? 's' : ''} · Code: {league.inviteCode}
                    </div>
                  </div>
                  <span style={{ color: 'var(--muted)', fontSize: 18 }}>›</span>
                </div>
              </Link>
            )
          ))}
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
