'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../store/auth';
import { createLeague, joinLeague, League } from '../../lib/api';

export default function LeaguesPage() {
  const { user, initialized } = useAuth();
  const router = useRouter();
  const [leagues, setLeagues] = useState<League[]>([]);
  const [newName, setNewName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (initialized && !user) router.replace('/');
  }, [initialized, user, router]);

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
      setLeagues((l) => [...l, league]);
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
      const league = await joinLeague(inviteCode.trim().toUpperCase());
      setInviteCode('');
      showToast(`Joined "${league.name}"!`);
      router.push(`/leagues/${league.id}`);
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
          <h3 style={{ marginBottom: 12 }}>Create a League</h3>
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
          <h3 style={{ marginBottom: 12 }}>Join a League</h3>
          <form onSubmit={handleJoin} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <input
              placeholder="Invite code (e.g. ABC12345)"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
              maxLength={8}
            />
            <button className="btn-primary" type="submit" disabled={loading || !inviteCode.trim()}>
              {loading ? <span className="spinner" /> : 'Join'}
            </button>
          </form>
        </div>
      </div>

      {error && <p style={{ color: 'var(--danger)', marginBottom: 16 }}>{error}</p>}

      {leagues.length === 0 && (
        <div className="card" style={{ textAlign: 'center', color: 'var(--muted)', padding: 40 }}>
          No leagues yet. Create one or join with an invite code.
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
