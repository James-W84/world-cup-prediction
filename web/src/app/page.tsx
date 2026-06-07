'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '../store/auth';
import {
  getHomeDashboard,
  HomeDashboard,
  UpcomingMatchWithPrediction,
} from '../lib/api';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

function ProfileCard({ user }: { user: { username: string; avatarUrl: string | null; totalPoints: number } }) {
  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
        {user.avatarUrl ? (
          <img
            src={user.avatarUrl}
            alt={user.username}
            style={{ width: 48, height: 48, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
          />
        ) : (
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: '50%',
              background: 'var(--border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 20,
              flexShrink: 0,
            }}
          >
            {user.username.charAt(0).toUpperCase()}
          </div>
        )}
        <div>
          <div style={{ fontWeight: 600, fontSize: 16 }}>{user.username}</div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>World Cup Predictor</div>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span style={{ fontSize: 32, fontWeight: 700 }}>{user.totalPoints}</span>
        <span style={{ fontSize: 13, color: 'var(--muted)' }}>total points</span>
      </div>
    </div>
  );
}

function StatsCard({ stats }: { stats: HomeDashboard['predictionStats'] }) {
  const accuracy = stats.scored > 0 ? Math.round((stats.correct / stats.scored) * 100) : null;

  return (
    <div className="card">
      <h3 style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)' }}>
        My Prediction Stats
      </h3>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <StatItem label="Submitted" value={stats.submitted} />
        <StatItem label="Scored" value={stats.scored} />
        <StatItem label="Correct" value={stats.correct} />
        <StatItem
          label="Accuracy"
          value={accuracy !== null ? `${accuracy}%` : '—'}
          highlight={accuracy !== null && accuracy >= 50}
        />
      </div>
      <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
        <Link href="/predictions" style={{ fontSize: 13, color: 'var(--accent)' }}>
          View all predictions →
        </Link>
      </div>
    </div>
  );
}

function StatItem({ label, value, highlight }: { label: string; value: string | number; highlight?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: 22, fontWeight: 700, color: highlight ? 'var(--success)' : 'inherit' }}>
        {value}
      </div>
      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{label}</div>
    </div>
  );
}

function UpcomingMatchRow({ match, last }: { match: UpcomingMatchWithPrediction; last: boolean }) {
  const kickoff = new Date(match.kickoffTime);
  const prediction = match.predictions[0] ?? null;
  const needsPrediction = !prediction || !prediction.isSubmitted;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 16px',
        borderBottom: last ? 'none' : '1px solid var(--border)',
        gap: 12,
        flexWrap: 'wrap',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 500, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {match.homeTeam} <span style={{ color: 'var(--muted)', fontWeight: 400 }}>vs</span> {match.awayTeam}
        </div>
        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
          {kickoff.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
          {' · '}
          {kickoff.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
        {prediction ? (
          prediction.isSubmitted ? (
            <span className="badge badge-info">
              {prediction.predictedOutcome === 'HOME_WIN'
                ? `${match.homeTeam} W`
                : prediction.predictedOutcome === 'AWAY_WIN'
                ? `${match.awayTeam} W`
                : 'Draw'}
            </span>
          ) : (
            <span className="badge badge-warning">Draft</span>
          )
        ) : (
          needsPrediction && <span className="badge badge-danger">Pending</span>
        )}
      </div>
    </div>
  );
}

function UpcomingMatchesCard({ matches }: { matches: UpcomingMatchWithPrediction[] }) {
  const pending = matches.filter((m) => !m.predictions[0]?.isSubmitted);

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '16px 16px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)' }}>
          Upcoming Matches
        </h3>
        {pending.length > 0 && (
          <span className="badge badge-danger" style={{ marginBottom: 16 }}>
            {pending.length} pending
          </span>
        )}
      </div>
      {matches.length === 0 ? (
        <div style={{ padding: '24px 16px', color: 'var(--muted)', fontSize: 13 }}>
          No upcoming matches scheduled.
        </div>
      ) : (
        <>
          {matches.map((match, i) => (
            <UpcomingMatchRow key={match.id} match={match} last={i === matches.length - 1} />
          ))}
          <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)' }}>
            <Link href="/predictions" style={{ fontSize: 13, color: 'var(--accent)' }}>
              Make predictions →
            </Link>
          </div>
        </>
      )}
    </div>
  );
}

function Dashboard({ user }: { user: { username: string; avatarUrl: string | null; totalPoints: number } }) {
  const [dashboard, setDashboard] = useState<HomeDashboard | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getHomeDashboard()
      .then(setDashboard)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="container" style={{ paddingTop: 40, textAlign: 'center' }}>
        <div className="spinner" />
      </div>
    );
  }

  return (
    <div className="container">
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 24,
          alignItems: 'start',
        }}
      >
        {/* Left column — upcoming matches */}
        <div>
          <UpcomingMatchesCard matches={dashboard?.upcomingMatches ?? []} />
        </div>

        {/* Right column — profile + stats */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <ProfileCard user={user} />
          {dashboard && <StatsCard stats={dashboard.predictionStats} />}
        </div>
      </div>
    </div>
  );
}

export default function HomePage() {
  const { user, initialized } = useAuth();

  if (!initialized) {
    return (
      <div className="container" style={{ textAlign: 'center', paddingTop: 80 }}>
        <div className="spinner" />
      </div>
    );
  }

  if (user) {
    return <Dashboard user={user} />;
  }

  return (
    <div className="container" style={{ textAlign: 'center', paddingTop: 80 }}>
      <h1 style={{ fontSize: 32, marginBottom: 12 }}>World Cup 2026 Predictor</h1>
      <p style={{ color: 'var(--muted)', marginBottom: 32 }}>
        Predict match outcomes, join leagues, and compete with friends.
      </p>
      <a href={`${API_URL}/auth/google`}>
        <button className="btn-primary" style={{ padding: '12px 32px', fontSize: 16 }}>
          Sign in with Google to start
        </button>
      </a>
    </div>
  );
}
