"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "../store/auth";
import {
  getHomeDashboard,
  HomeDashboard,
  UpcomingMatchWithPrediction,
  StageStats,
} from "../lib/api";
import { GoogleAuthButton } from "../components/GoogleAuthButton";

function ProfileCard({
  user,
}: {
  user: { username: string; avatarUrl: string | null; totalPoints: number };
}) {
  return (
    <div className="card">
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          marginBottom: 16,
        }}
      >
        {user.avatarUrl ? (
          <img
            src={user.avatarUrl}
            alt={user.username}
            style={{
              width: 48,
              height: 48,
              borderRadius: "50%",
              objectFit: "cover",
              flexShrink: 0,
            }}
          />
        ) : (
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: "50%",
              background: "var(--border)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 20,
              flexShrink: 0,
            }}
          >
            {user.username.charAt(0).toUpperCase()}
          </div>
        )}
        <div>
          <div style={{ fontWeight: 600, fontSize: 16 }}>{user.username}</div>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>
            World Cup 2026 Predictor
          </div>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <span style={{ fontSize: 32, fontWeight: 700 }}>
          {user.totalPoints}
        </span>
        <span style={{ fontSize: 13, color: "var(--muted)" }}>
          total points
        </span>
      </div>
    </div>
  );
}

function StageStatsRow({ label, stats }: { label: string; stats: StageStats }) {
  const accuracy =
    stats.scored > 0 ? Math.round((stats.correct / stats.scored) * 100) : null;
  return (
    <div>
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          color: "var(--muted)",
          marginBottom: 8,
        }}
      >
        {label}
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 8,
        }}
      >
        {[
          { label: "Submitted", value: stats.submitted },
          { label: "Scored", value: stats.scored },
          { label: "Correct", value: stats.correct },
          {
            label: "Accuracy",
            value: accuracy !== null ? `${accuracy}%` : "—",
            highlight: accuracy !== null && accuracy >= 50,
          },
        ].map(({ label: l, value, highlight }) => (
          <div key={l}>
            <div
              style={{
                fontSize: 18,
                fontWeight: 700,
                color: highlight ? "var(--success)" : "inherit",
              }}
            >
              {value}
            </div>
            <div style={{ fontSize: 11, color: "var(--muted)" }}>{l}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatsCard({ stats }: { stats: HomeDashboard["predictionStats"] }) {
  return (
    <div className="card">
      <h3
        style={{
          margin: "0 0 14px",
          fontSize: 14,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          color: "var(--muted)",
        }}
      >
        My Prediction Stats
      </h3>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <StageStatsRow label="Group Stage" stats={stats.group} />
        <div style={{ height: 1, background: "var(--border)" }} />
        <StageStatsRow label="Knockout" stats={stats.knockout} />
      </div>
      <div
        style={{
          marginTop: 16,
          paddingTop: 14,
          borderTop: "1px solid var(--border)",
        }}
      >
        <Link
          href="/predictions"
          style={{ fontSize: 13, color: "var(--accent)" }}
        >
          View all predictions →
        </Link>
      </div>
    </div>
  );
}

function UpcomingMatchRow({
  match,
  last,
}: {
  match: UpcomingMatchWithPrediction;
  last: boolean;
}) {
  const kickoff = new Date(match.kickoffTime);
  const prediction = match.predictions[0] ?? null;

  const predictionBadge = prediction?.isSubmitted ? (
    <span className="badge badge-info">
      Prediction:{" "}
      {prediction.predictedOutcome === "HOME_WIN"
        ? `${match.homeTeam} Win`
        : prediction.predictedOutcome === "AWAY_WIN"
          ? `${match.awayTeam} Win`
          : "Draw"}
    </span>
  ) : prediction ? (
    <span className="badge badge-warning">Draft</span>
  ) : (
    <Link href="/predictions" style={{ textDecoration: "none" }}>
      <span className="badge badge-danger" style={{ cursor: "pointer" }}>
        Predict now →
      </span>
    </Link>
  );

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "11px 16px",
        borderBottom: last ? "none" : "1px solid var(--border)",
        gap: 12,
        flexWrap: "wrap",
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontWeight: 500,
            fontSize: 14,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {match.homeTeam}{" "}
          <span style={{ color: "var(--muted)", fontWeight: 400 }}>vs</span>{" "}
          {match.awayTeam}
        </div>
        <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
          {kickoff.toLocaleDateString(undefined, {
            weekday: "short",
            month: "short",
            day: "numeric",
          })}
          {" · "}
          {kickoff.toLocaleTimeString(undefined, {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </div>
      </div>
      <div style={{ flexShrink: 0 }}>{predictionBadge}</div>
    </div>
  );
}

const PAGE_SIZE = 8;

function UpcomingMatchesCard() {
  const [matches, setMatches] = useState<UpcomingMatchWithPrediction[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [paging, setPaging] = useState(false);

  useEffect(() => {
    getHomeDashboard(0)
      .then((data) => {
        setMatches(data.upcomingMatches);
        setTotal(data.totalUpcoming);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function goToPage(p: number) {
    setPaging(true);
    try {
      const data = await getHomeDashboard(p * PAGE_SIZE);
      setMatches(data.upcomingMatches);
      setPage(p);
    } catch {
      /* ignore */
    } finally {
      setPaging(false);
    }
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      <div
        style={{
          padding: "14px 16px",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <h3
          style={{
            margin: 0,
            fontSize: 14,
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            color: "var(--muted)",
          }}
        >
          Upcoming Matches
        </h3>
      </div>

      {loading ? (
        <div style={{ padding: 32, textAlign: "center" }}>
          <div className="spinner" />
        </div>
      ) : matches.length === 0 ? (
        <div
          style={{ padding: "24px 16px", color: "var(--muted)", fontSize: 13 }}
        >
          No upcoming matches scheduled.
        </div>
      ) : (
        <>
          <div
            style={{
              position: "relative",
              opacity: paging ? 0.5 : 1,
              transition: "opacity 0.15s",
            }}
          >
            {matches.map((match, i) => (
              <UpcomingMatchRow
                key={match.id}
                match={match}
                last={i === matches.length - 1}
              />
            ))}
          </div>
          {totalPages > 1 && (
            <div
              style={{
                padding: "10px 16px",
                borderTop: "1px solid var(--border)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
              }}
            >
              <button
                className="btn-secondary"
                style={{ fontSize: 12, padding: "4px 10px" }}
                disabled={page === 0 || paging}
                onClick={() => goToPage(page - 1)}
              >
                ← Prev
              </button>
              <span style={{ fontSize: 12, color: "var(--muted)" }}>
                Page {page + 1} of {totalPages}
              </span>
              <button
                className="btn-secondary"
                style={{ fontSize: 12, padding: "4px 10px" }}
                disabled={page >= totalPages - 1 || paging}
                onClick={() => goToPage(page + 1)}
              >
                Next →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Dashboard({
  user,
}: {
  user: { username: string; avatarUrl: string | null; totalPoints: number };
}) {
  const [stats, setStats] = useState<HomeDashboard["predictionStats"] | null>(
    null,
  );

  useEffect(() => {
    getHomeDashboard(0)
      .then((data) => setStats(data.predictionStats))
      .catch(() => {});
  }, []);

  return (
    <div className="container">
      <div
        className="dashboard-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 24,
          alignItems: "start",
        }}
      >
        <UpcomingMatchesCard />
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <ProfileCard user={user} />
          {stats && <StatsCard stats={stats} />}
        </div>
      </div>
    </div>
  );
}

export default function HomePage() {
  const { user, initialized } = useAuth();

  if (!initialized) {
    return (
      <div
        className="container"
        style={{ textAlign: "center", paddingTop: 80 }}
      >
        <div className="spinner" />
        <p style={{ marginTop: 16, color: "var(--muted)" }}>
          Just a moment while we get everything ready for you…
        </p>
        <p style={{ marginTop: 8, color: "var(--muted)", fontSize: 13 }}>
          Preparing your session... just a moment.
        </p>
      </div>
    );
  }

  if (user) {
    return <Dashboard user={user} />;
  }

  return (
    <div className="container" style={{ textAlign: "center", paddingTop: 80 }}>
      <h1 style={{ fontSize: 32, marginBottom: 12 }}>
        World Cup 2026 Predictor
      </h1>
      <p style={{ color: "var(--muted)", marginBottom: 32 }}>
        Predict match outcomes, join leagues, and compete with friends.
      </p>
      <GoogleAuthButton
        label="Sign in with Google to start"
        style={{ padding: "12px 32px", fontSize: 16 }}
      />
    </div>
  );
}
