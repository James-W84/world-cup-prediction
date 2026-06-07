'use client';
import { useEffect, useState } from 'react';
import { getMatches, Match } from '../../lib/api';

const STAGES = ['GROUP', 'LAST_32', 'ROUND_OF_16', 'QF', 'SF', 'FINAL'];
const STAGE_LABELS: Record<string, string> = {
  GROUP: 'Group Stage',
  LAST_32: 'Round of 32',
  ROUND_OF_16: 'Round of 16',
  QF: 'Quarterfinals',
  SF: 'Semifinals',
  FINAL: 'Final',
};

function groupByGroup(matches: Match[]): { label: string; sectionMatches: Match[] }[] {
  const map = new Map<string, Match[]>();
  for (const m of matches) {
    const key = m.group ?? 'TBD';
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(m);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, sectionMatches]) => ({
      label: key === 'TBD' ? 'TBD' : `Group ${key}`,
      sectionMatches,
    }));
}

function groupByDay(matches: Match[]): { label: string; sectionMatches: Match[] }[] {
  const sections: { label: string; sectionMatches: Match[] }[] = [];
  let lastKey = '';
  for (const m of [...matches].sort((a, b) => new Date(a.kickoffTime).getTime() - new Date(b.kickoffTime).getTime())) {
    const d = new Date(m.kickoffTime);
    const key = d.toLocaleDateString(undefined, { year: 'numeric', month: 'numeric', day: 'numeric' });
    const label = d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
    if (key !== lastKey) {
      sections.push({ label, sectionMatches: [] });
      lastKey = key;
    }
    sections[sections.length - 1].sectionMatches.push(m);
  }
  return sections;
}

function MatchRow({ match, last }: { match: Match; last: boolean }) {
  const kickoff = new Date(match.kickoffTime);
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: '12px 16px',
        borderBottom: last ? 'none' : '1px solid var(--border)',
        gap: 12,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{ fontWeight: match.actualOutcome === 'HOME_WIN' ? 700 : 400 }}>
          {match.homeTeam}
        </span>
        <span style={{ color: 'var(--muted)', margin: '0 8px' }}>vs</span>
        <span style={{ fontWeight: match.actualOutcome === 'AWAY_WIN' ? 700 : 400 }}>
          {match.awayTeam}
        </span>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
        {match.status === 'LIVE' && <span className="badge badge-success">LIVE</span>}
        {match.status === 'COMPLETED' && (
          <>
            <span style={{ fontSize: 13, color: 'var(--muted)' }}>
              {match.actualOutcome === 'HOME_WIN' ? '1–0' :
               match.actualOutcome === 'AWAY_WIN' ? '0–1' : '1–1'}
            </span>
            <span className="badge badge-info">FT</span>
          </>
        )}
        {match.status === 'UPCOMING' && (
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>
            {kickoff.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
      </div>
    </div>
  );
}

export default function MatchesPage() {
  const [activeStage, setActiveStage] = useState('GROUP');
  const [sortBy, setSortBy] = useState<'group' | 'date'>('date');
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getMatches(activeStage).then(({ matches: data }) => {
      setMatches(data);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [activeStage]);

  const isGroupStage = activeStage === 'GROUP';

  const sections = isGroupStage && sortBy === 'group'
    ? groupByGroup(matches)
    : isGroupStage && sortBy === 'date'
    ? groupByDay(matches)
    : [{ label: '', sectionMatches: matches }];

  return (
    <div className="container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <h1 style={{ margin: 0 }}>Matches</h1>
        {isGroupStage && (
          <div style={{ display: 'flex', gap: 4 }}>
            <button
              className={sortBy === 'date' ? 'btn-primary' : 'btn-secondary'}
              style={{ fontSize: 12, padding: '5px 10px' }}
              onClick={() => setSortBy('date')}
            >
              By Date
            </button>
            <button
              className={sortBy === 'group' ? 'btn-primary' : 'btn-secondary'}
              style={{ fontSize: 12, padding: '5px 10px' }}
              onClick={() => setSortBy('group')}
            >
              By Group
            </button>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 20, overflowX: 'auto' }}>
        {STAGES.map((s) => (
          <button
            key={s}
            className={activeStage === s ? 'btn-primary' : 'btn-secondary'}
            style={{ fontSize: 13, padding: '6px 12px', whiteSpace: 'nowrap' }}
            onClick={() => setActiveStage(s)}
          >
            {STAGE_LABELS[s]}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', paddingTop: 40 }}><div className="spinner" /></div>
      ) : matches.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', color: 'var(--muted)', padding: 40 }}>
          No matches for this stage yet.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {sections.map(({ label, sectionMatches }) => (
            <div key={label}>
              {label && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  margin: '20px 0 10px', color: 'var(--muted)',
                  fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em',
                }}>
                  <span style={{ whiteSpace: 'nowrap' }}>{label}</span>
                  <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                </div>
              )}
              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                {sectionMatches.map((match, i) => (
                  <MatchRow key={match.id} match={match} last={i === sectionMatches.length - 1} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
