'use client';
import { useEffect, useState } from 'react';
import { getMatches, Match } from '../../lib/api';
import { BracketLayout, BRACKET_CARD_W } from '../../components/BracketLayout';

const STAGE_LABELS: Record<string, string> = {
  GROUP: 'Group Stage', LAST_32: 'Round of 32', ROUND_OF_16: 'Round of 16',
  QF: 'Quarterfinals', SF: 'Semifinals', FINAL: 'Final',
};
const KNOCKOUT_ROUNDS = ['LAST_32', 'ROUND_OF_16', 'QF', 'SF', 'FINAL'] as const;

function groupByGroup(matches: Match[]): { label: string; sectionMatches: Match[] }[] {
  const map = new Map<string, Match[]>();
  for (const m of matches) {
    const key = m.group ?? 'TBD';
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(m);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, sectionMatches]) => ({ label: key === 'TBD' ? 'TBD' : `Group ${key}`, sectionMatches }));
}

function groupByDay(matches: Match[]): { label: string; sectionMatches: Match[] }[] {
  const sections: { label: string; sectionMatches: Match[] }[] = [];
  let lastKey = '';
  for (const m of [...matches].sort((a, b) => new Date(a.kickoffTime).getTime() - new Date(b.kickoffTime).getTime())) {
    const d = new Date(m.kickoffTime);
    const key = d.toLocaleDateString(undefined, { year: 'numeric', month: 'numeric', day: 'numeric' });
    const label = d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
    if (key !== lastKey) { sections.push({ label, sectionMatches: [] }); lastKey = key; }
    sections[sections.length - 1].sectionMatches.push(m);
  }
  return sections;
}

// Knockout schedule: sections by round, then by date within each round
function groupKnockoutSchedule(
  matchesByRound: Record<string, Match[]>
): { roundLabel: string; days: { label: string; sectionMatches: Match[] }[] }[] {
  return KNOCKOUT_ROUNDS.flatMap((round) => {
    const matches = matchesByRound[round] || [];
    if (matches.length === 0) return [];
    // Label "3rd Place Play-off" for the 3rd SF match
    if (round === 'SF') {
      const actual = matches.slice(0, 2);
      const third = matches[2];
      const result: { roundLabel: string; days: { label: string; sectionMatches: Match[] }[] }[] = [];
      if (actual.length > 0) result.push({ roundLabel: 'Semifinals', days: groupByDay(actual) });
      if (third) result.push({ roundLabel: '3rd Place Play-off', days: groupByDay([third]) });
      return result;
    }
    return [{ roundLabel: STAGE_LABELS[round], days: groupByDay(matches) }];
  });
}

function MatchRow({ match, last }: { match: Match; last: boolean }) {
  const kickoff = new Date(match.kickoffTime);
  return (
    <div style={{
      display: 'flex', alignItems: 'center', padding: '12px 16px',
      borderBottom: last ? 'none' : '1px solid var(--border)', gap: 12,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{ fontWeight: match.actualOutcome === 'HOME_WIN' ? 700 : 400 }}>{match.homeTeam}</span>
        <span style={{ color: 'var(--muted)', margin: '0 8px' }}>vs</span>
        <span style={{ fontWeight: match.actualOutcome === 'AWAY_WIN' ? 700 : 400 }}>{match.awayTeam}</span>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
        {match.status === 'LIVE' && <span className="badge badge-success">LIVE</span>}
        {match.status === 'COMPLETED' && (
          <>
            <span style={{ fontSize: 13, color: 'var(--muted)' }}>
              {match.actualOutcome === 'HOME_WIN' ? '1–0' : match.actualOutcome === 'AWAY_WIN' ? '0–1' : '1–1'}
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

// ─── Read-only bracket card ───────────────────────────────────────────────────

function BracketCard({ match }: { match: Match }) {
  const homeWon = match.actualOutcome === 'HOME_WIN';
  const awayWon = match.actualOutcome === 'AWAY_WIN';
  return (
    <div className="card" style={{ padding: '3px 0', overflow: 'hidden', width: '100%' }}>
      <div style={{ fontSize: 9, color: 'var(--muted)', padding: '2px 8px 1px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {new Date(match.kickoffTime).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
        {match.status === 'LIVE' && <span style={{ color: 'var(--success)', marginLeft: 4 }}>● LIVE</span>}
        {match.status === 'COMPLETED' && <span style={{ marginLeft: 4 }}>FT</span>}
      </div>
      {(['homeTeam', 'awayTeam'] as const).map((side, i) => {
        const isWinner = side === 'homeTeam' ? homeWon : awayWon;
        return (
          <div key={side}>
            {i === 1 && <div style={{ height: 1, background: 'var(--border)', margin: '1px 6px' }} />}
            <div style={{
              padding: '5px 8px', fontSize: 12,
              fontWeight: isWinner ? 700 : 400,
              color: isWinner ? 'var(--text)' : 'var(--muted)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {match[side]}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ReadOnlyBracket({ matchesByRound }: { matchesByRound: Record<string, Match[]> }) {
  return (
    <BracketLayout<Match>
      rounds={KNOCKOUT_ROUNDS}
      roundLabels={STAGE_LABELS}
      matchesByRound={matchesByRound}
      renderCard={(match) => <BracketCard match={match} />}
    />
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function MatchesPage() {
  const [activeTab, setActiveTab] = useState<'GROUP' | 'KNOCKOUT'>('GROUP');
  const [sortBy, setSortBy] = useState<'group' | 'date'>('date');
  const [viewMode, setViewMode] = useState<'schedule' | 'bracket'>('bracket');

  const [groupMatches, setGroupMatches] = useState<Match[]>([]);
  const [knockoutByRound, setKnockoutByRound] = useState<Record<string, Match[]>>({});
  const [loading, setLoading] = useState(true);

  // Load group matches
  useEffect(() => {
    if (activeTab !== 'GROUP') return;
    setLoading(true);
    getMatches('GROUP').then(({ matches }) => {
      setGroupMatches(matches);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [activeTab]);

  // Load all knockout rounds (once, shared by both schedule and bracket views)
  useEffect(() => {
    if (activeTab !== 'KNOCKOUT') return;
    if (Object.keys(knockoutByRound).length > 0) return;
    setLoading(true);
    Promise.all(KNOCKOUT_ROUNDS.map((r) => getMatches(r)))
      .then((results) => {
        const byRound: Record<string, Match[]> = {};
        results.forEach(({ matches }, i) => { byRound[KNOCKOUT_ROUNDS[i]] = matches; });
        setKnockoutByRound(byRound);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [activeTab, knockoutByRound]);

  const groupSections = sortBy === 'group' ? groupByGroup(groupMatches) : groupByDay(groupMatches);
  const knockoutSections = groupKnockoutSchedule(knockoutByRound);

  return (
    <div className="container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <h1 style={{ margin: 0 }}>Matches</h1>
        <div style={{ display: 'flex', gap: 4 }}>
          {activeTab === 'GROUP' && (
            <>
              <button className={sortBy === 'date' ? 'btn-primary' : 'btn-secondary'} style={{ fontSize: 12, padding: '5px 10px' }} onClick={() => setSortBy('date')}>By Date</button>
              <button className={sortBy === 'group' ? 'btn-primary' : 'btn-secondary'} style={{ fontSize: 12, padding: '5px 10px' }} onClick={() => setSortBy('group')}>By Group</button>
            </>
          )}
          {activeTab === 'KNOCKOUT' && (
            <>
              <button className={viewMode === 'schedule' ? 'btn-primary' : 'btn-secondary'} style={{ fontSize: 12, padding: '5px 10px' }} onClick={() => setViewMode('schedule')}>Schedule</button>
              <button className={viewMode === 'bracket' ? 'btn-primary' : 'btn-secondary'} style={{ fontSize: 12, padding: '5px 10px' }} onClick={() => setViewMode('bracket')}>Bracket</button>
            </>
          )}
        </div>
      </div>

      {/* Top-level tab selector */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
        {(['GROUP', 'KNOCKOUT'] as const).map((tab) => (
          <button
            key={tab}
            className={activeTab === tab ? 'btn-primary' : 'btn-secondary'}
            style={{ fontSize: 14, padding: '7px 18px', fontWeight: 600 }}
            onClick={() => setActiveTab(tab)}
          >
            {tab === 'GROUP' ? 'Group Stage' : 'Knockout'}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', paddingTop: 40 }}><div className="spinner" /></div>
      ) : activeTab === 'KNOCKOUT' && viewMode === 'bracket' ? (
        <ReadOnlyBracket matchesByRound={knockoutByRound} />
      ) : activeTab === 'KNOCKOUT' ? (
        /* Knockout schedule: sectioned by round, then by date */
        knockoutSections.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', color: 'var(--muted)', padding: 40 }}>No knockout matches yet.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {knockoutSections.map(({ roundLabel, days }) => (
              <div key={roundLabel}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  margin: '24px 0 12px', color: 'var(--accent)',
                  fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em',
                }}>
                  <span style={{ whiteSpace: 'nowrap' }}>{roundLabel}</span>
                  <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                </div>
                {days.map(({ label, sectionMatches }) => (
                  <div key={label} style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6, fontWeight: 500 }}>{label}</div>
                    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                      {sectionMatches.map((match, i) => (
                        <MatchRow key={match.id} match={match} last={i === sectionMatches.length - 1} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )
      ) : /* Group schedule */ groupMatches.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', color: 'var(--muted)', padding: 40 }}>No matches yet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {groupSections.map(({ label, sectionMatches }) => (
            <div key={label}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                margin: '20px 0 10px', color: 'var(--muted)',
                fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em',
              }}>
                <span style={{ whiteSpace: 'nowrap' }}>{label}</span>
                <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
              </div>
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
