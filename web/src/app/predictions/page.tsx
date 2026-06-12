'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../store/auth';
import { usePredictions } from '../../store/predictions';
import { getMatches, savePrediction, submitPrediction, Match, MatchPrediction } from '../../lib/api';
import { BracketLayout } from '../../components/BracketLayout';

// ─── helpers ────────────────────────────────────────────────────────────────

function groupByDay(matches: Match[]): { label: string; dayMatches: Match[] }[] {
  const groups: { label: string; dayMatches: Match[] }[] = [];
  let lastKey = '';
  for (const match of matches) {
    const d = new Date(match.kickoffTime);
    const key = d.toLocaleDateString(undefined, { year: 'numeric', month: 'numeric', day: 'numeric' });
    const label = d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
    if (key !== lastKey) { groups.push({ label, dayMatches: [] }); lastKey = key; }
    groups[groups.length - 1].dayMatches.push(match);
  }
  return groups;
}

interface TeamRecord { played: number; wins: number; draws: number; losses: number; points: number }

function computeGroupStandings(
  matches: Match[],
  dbPredictions: Record<string, MatchPrediction>
): Map<string, { label: string; teams: [string, TeamRecord][] }> {
  const groups = new Map<string, Map<string, TeamRecord>>();
  for (const match of matches) {
    if (!match.group) continue;
    if (!groups.has(match.group)) groups.set(match.group, new Map());
    const g = groups.get(match.group)!;
    const ensure = (t: string) => {
      if (!g.has(t)) g.set(t, { played: 0, wins: 0, draws: 0, losses: 0, points: 0 });
    };
    ensure(match.homeTeam);
    ensure(match.awayTeam);
    const pred = dbPredictions[match.id];
    if (!pred) continue;
    const home = g.get(match.homeTeam)!;
    const away = g.get(match.awayTeam)!;
    home.played++; away.played++;
    if (pred.predictedOutcome === 'HOME_WIN') {
      home.wins++; home.points += 3; away.losses++;
    } else if (pred.predictedOutcome === 'AWAY_WIN') {
      away.wins++; away.points += 3; home.losses++;
    } else {
      home.draws++; home.points++; away.draws++; away.points++;
    }
  }
  const result = new Map<string, { label: string; teams: [string, TeamRecord][] }>();
  for (const [group, teamMap] of Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b))) {
    const teams = Array.from(teamMap.entries()).sort(([nameA, a], [nameB, b]) =>
      b.points - a.points || b.wins - a.wins || nameA.localeCompare(nameB)
    );
    result.set(group, { label: `Group ${group}`, teams });
  }
  return result;
}

// Returns a Set of team names that are best 3rd-place qualifiers (top 8 of 12 groups)
function computeBest3rdTeams(
  standings: Map<string, { label: string; teams: [string, TeamRecord][] }>
): Set<string> {
  const thirds: { team: string; record: TeamRecord }[] = [];
  for (const { teams } of standings.values()) {
    if (teams.length >= 3) {
      thirds.push({ team: teams[2][0], record: teams[2][1] });
    }
  }
  thirds.sort((a, b) =>
    b.record.points - a.record.points ||
    b.record.wins - a.record.wins ||
    a.team.localeCompare(b.team)
  );
  return new Set(thirds.slice(0, 8).map((t) => t.team));
}

// ─── constants ────────────────────────────────────────────────────────────────

const KNOCKOUT_ROUNDS = ['LAST_32', 'ROUND_OF_16', 'QF', 'SF', 'FINAL'] as const;
type KnockoutRound = typeof KNOCKOUT_ROUNDS[number];

const ROUND_LABELS: Record<string, string> = {
  LAST_32: 'Round of 32', ROUND_OF_16: 'Round of 16',
  QF: 'Quarterfinals', SF: 'Semifinals', FINAL: 'Final',
};

const DEFAULT_KNOCKOUT_ROUND: KnockoutRound = 'LAST_32';

// Which positions in the PREVIOUS round feed each match (by sorted-kickoff index).
// BRACKET_FEEDERS[round][matchIdx] = [feederIdxInPrevRound, feederIdxInPrevRound]
const BRACKET_FEEDERS: Partial<Record<KnockoutRound, [number, number][]>> = {
  ROUND_OF_16: [[1,4],[0,2],[3,5],[6,7],[10,11],[8,9],[13,15],[12,14]],
  QF:          [[0,1],[4,5],[2,3],[6,7]],
  SF:          [[0,1],[2,3],[0,1]], // [0,1] for 3rd-place play-off means both SFs must be predicted
  FINAL:       [[0,1]],
};
const PREV_ROUND: Partial<Record<KnockoutRound, KnockoutRound>> = {
  ROUND_OF_16: 'LAST_32', QF: 'ROUND_OF_16', SF: 'QF', FINAL: 'SF',
};
// For the SF 3rd-place match (index 2), the prev round is SF itself
const SF_3RD_IDX = 2;

function isBracketMatchUnlocked(
  round: KnockoutRound,
  matchOrigIdx: number,
  matchesByRound: Record<string, Match[]>,
  dbPredictions: Record<string, MatchPrediction>,
): boolean {
  if (round === 'LAST_32') return true;
  const feeders = BRACKET_FEEDERS[round]?.[matchOrigIdx];
  // 3rd-place play-off depends on the two actual SF matches being predicted
  const prevRoundKey: KnockoutRound | undefined =
    round === 'SF' && matchOrigIdx === SF_3RD_IDX ? 'SF' : PREV_ROUND[round];
  if (!feeders || !prevRoundKey) return true;
  // For 3rd place, check SF[0] and SF[1] (the actual semis)
  const prevMatches = round === 'SF' && matchOrigIdx === SF_3RD_IDX
    ? (matchesByRound['SF'] || []).slice(0, 2)
    : (matchesByRound[prevRoundKey] || []);
  return feeders.every((pos) => {
    const m = prevMatches[pos];
    return m != null && dbPredictions[m.id]?.predictedOutcome != null;
  });
}

// ─── ScoringTooltip ────────────────────────────────────────────────────────

function ScoringTooltip() {
  const [show, setShow] = useState(false);
  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button
        className="btn-secondary"
        style={{ fontSize: 11, padding: '3px 8px' }}
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        onClick={() => setShow((s) => !s)}
      >
        ℹ Scoring
      </button>
      {show && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 20,
          background: '#111827',
          border: '1px solid var(--border)', borderRadius: 8,
          padding: '12px 14px', minWidth: 220, fontSize: 12, lineHeight: 1.6,
          boxShadow: '0 4px 20px rgba(0,0,0,0.7)',
        }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Points per correct prediction:</div>
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <tbody>
              {([['Group Stage', '1'], ['Round of 32', '1'], ['Round of 16', '2'],
                ['Quarterfinals', '3'], ['Semifinals', '3'], ['Final', '5']] as const).map(([stage, pts]) => (
                <tr key={stage}>
                  <td style={{ color: 'var(--muted)', paddingRight: 12 }}>{stage}</td>
                  <td style={{ fontWeight: 600, textAlign: 'right' }}>{pts} pt{pts !== '1' ? 's' : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.1)', color: 'var(--muted)' }}>
            <strong style={{ color: 'var(--text)' }}>Group table bonus:</strong> up to +4 pts per group for correctly predicting final standings order.
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sub-tab pill style ────────────────────────────────────────────────────

function SubTab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: 'none',
        border: 'none',
        borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
        color: active ? 'var(--accent)' : 'var(--muted)',
        fontWeight: active ? 600 : 400,
        fontSize: 13,
        padding: '6px 12px',
        cursor: 'pointer',
        transition: 'color 0.15s, border-color 0.15s',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </button>
  );
}

// ─── GroupStandingsView ────────────────────────────────────────────────────

function GroupStandingsView({ matches, dbPredictions }: { matches: Match[]; dbPredictions: Record<string, MatchPrediction> }) {
  const standings = computeGroupStandings(matches, dbPredictions);
  const best3rdSet = computeBest3rdTeams(standings);
  const totalPredicted = Object.keys(dbPredictions).length;
  const totalMatches = matches.length;

  // Build ranked list of all 3rd-place teams for the summary table
  const thirds: { group: string; team: string; record: TeamRecord }[] = [];
  for (const [group, { teams }] of standings.entries()) {
    if (teams.length >= 3) thirds.push({ group, team: teams[2][0], record: teams[2][1] });
  }
  thirds.sort((a, b) =>
    b.record.points - a.record.points ||
    b.record.wins - a.record.wins ||
    a.team.localeCompare(b.team)
  );

  return (
    <div>
      <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 16 }}>
        Predicted standings based on your {totalPredicted}/{totalMatches} predictions.
        Top 2 per group + best 8 3rd-placed teams advance.
      </p>

      {/* Best 3rd-placed teams summary */}
      {thirds.length > 0 && (
        <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 20 }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', fontWeight: 600, fontSize: 13 }}>
            Best 3rd-Placed Teams
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--bg)' }}>
                <th style={{ padding: '6px 14px', textAlign: 'left', color: 'var(--muted)', fontWeight: 500 }}>#</th>
                <th style={{ padding: '6px 14px', textAlign: 'left', color: 'var(--muted)', fontWeight: 500 }}>Team</th>
                <th style={{ padding: '6px 8px', textAlign: 'center', color: 'var(--muted)', fontWeight: 500 }}>Grp</th>
                <th style={{ padding: '6px 8px', textAlign: 'center', color: 'var(--muted)', fontWeight: 500 }}>W</th>
                <th style={{ padding: '6px 8px', textAlign: 'center', color: 'var(--muted)', fontWeight: 500 }}>D</th>
                <th style={{ padding: '6px 8px', textAlign: 'center', color: 'var(--muted)', fontWeight: 500 }}>L</th>
                <th style={{ padding: '6px 14px', textAlign: 'right', color: 'var(--muted)', fontWeight: 500 }}>Pts</th>
              </tr>
            </thead>
            <tbody>
              {thirds.map(({ group, team, record }, i) => {
                const advances = i < 8;
                return (
                  <tr key={team} style={{
                    borderTop: '1px solid var(--border)',
                    background: advances ? 'rgba(59,130,246,0.05)' : 'transparent',
                  }}>
                    <td style={{ padding: '7px 14px', color: 'var(--muted)', fontSize: 11 }}>{i + 1}</td>
                    <td style={{ padding: '7px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {advances && <span style={{ fontSize: 9, color: 'var(--success)', fontWeight: 700, textTransform: 'uppercase' }}>ADV</span>}
                        <span style={{ fontWeight: advances ? 600 : 400 }}>{team}</span>
                      </div>
                    </td>
                    <td style={{ padding: '7px 8px', textAlign: 'center', color: 'var(--muted)' }}>{group}</td>
                    <td style={{ padding: '7px 8px', textAlign: 'center' }}>{record.wins}</td>
                    <td style={{ padding: '7px 8px', textAlign: 'center' }}>{record.draws}</td>
                    <td style={{ padding: '7px 8px', textAlign: 'center' }}>{record.losses}</td>
                    <td style={{ padding: '7px 14px', textAlign: 'right', fontWeight: 700 }}>{record.points}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Per-group tables */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
        {Array.from(standings.entries()).map(([group, { label, teams }]) => (
          <div key={group} className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', fontWeight: 600, fontSize: 13 }}>
              {label}
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: 'var(--bg)' }}>
                  <th style={{ padding: '6px 14px', textAlign: 'left', color: 'var(--muted)', fontWeight: 500 }}>Team</th>
                  <th style={{ padding: '6px 8px', textAlign: 'center', color: 'var(--muted)', fontWeight: 500 }}>P</th>
                  <th style={{ padding: '6px 8px', textAlign: 'center', color: 'var(--muted)', fontWeight: 500 }}>W</th>
                  <th style={{ padding: '6px 8px', textAlign: 'center', color: 'var(--muted)', fontWeight: 500 }}>D</th>
                  <th style={{ padding: '6px 8px', textAlign: 'center', color: 'var(--muted)', fontWeight: 500 }}>L</th>
                  <th style={{ padding: '6px 14px', textAlign: 'right', color: 'var(--muted)', fontWeight: 500 }}>Pts</th>
                </tr>
              </thead>
              <tbody>
                {teams.map(([team, record], i) => {
                  const advances = i < 2 || best3rdSet.has(team);
                  const isBest3rd = i === 2 && best3rdSet.has(team);
                  return (
                    <tr key={team} style={{
                      borderTop: '1px solid var(--border)',
                      background: i < 2 ? 'rgba(59,130,246,0.06)' : isBest3rd ? 'rgba(59,130,246,0.03)' : 'transparent',
                    }}>
                      <td style={{ padding: '8px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          {i < 2 && <span style={{ fontSize: 9, color: 'var(--accent)', fontWeight: 700, textTransform: 'uppercase' }}>ADV</span>}
                          {isBest3rd && <span style={{ fontSize: 9, color: 'var(--success)', fontWeight: 700, textTransform: 'uppercase' }}>3rd</span>}
                          <span style={{ fontWeight: advances ? 600 : 400 }}>{team}</span>
                        </div>
                      </td>
                      <td style={{ padding: '8px', textAlign: 'center', color: 'var(--muted)' }}>{record.played}</td>
                      <td style={{ padding: '8px', textAlign: 'center' }}>{record.wins}</td>
                      <td style={{ padding: '8px', textAlign: 'center' }}>{record.draws}</td>
                      <td style={{ padding: '8px', textAlign: 'center' }}>{record.losses}</td>
                      <td style={{ padding: '8px 14px', textAlign: 'right', fontWeight: 700 }}>{record.points}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Bracket components ───────────────────────────────────────────────────

function BracketTeamRow({
  team, outcome, predicted, scored, pointsAwarded, actual, locked, isSaving, unlocked, onClick,
}: {
  team: string; outcome: 'HOME_WIN' | 'AWAY_WIN';
  predicted?: string; scored?: boolean; pointsAwarded?: number; actual?: string;
  locked: boolean; isSaving: boolean; unlocked: boolean; onClick: () => void;
}) {
  const isSelected = predicted === outcome;
  const isCorrect = scored && actual === outcome && isSelected;
  const isWrong = scored && isSelected && actual !== outcome;
  const canClick = unlocked && !locked && !isSaving;

  return (
    <button
      onClick={() => canClick && onClick()}
      disabled={!canClick}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        width: '100%', padding: '5px 8px',
        background: isSelected ? 'rgba(59,130,246,0.18)' : 'transparent',
        border: 'none', borderRadius: 4,
        cursor: canClick ? 'pointer' : 'default',
        color: isSelected ? 'var(--accent)' : unlocked ? 'var(--text)' : 'var(--muted)',
        fontWeight: isSelected ? 600 : 400,
        fontSize: 12, textAlign: 'left',
        opacity: unlocked ? 1 : 0.5,
      }}
    >
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, marginRight: 4 }}>
        {team}
      </span>
      {isSaving && isSelected && <span className="spinner" style={{ width: 10, height: 10 }} />}
      {!isSaving && scored && isSelected && (
        <span style={{ fontSize: 10, color: isCorrect ? 'var(--success)' : 'var(--danger)', flexShrink: 0 }}>
          {isCorrect ? `+${pointsAwarded}` : '✗'}
        </span>
      )}
      {!isSaving && !scored && isSelected && (
        <span style={{ fontSize: 10, color: 'var(--accent)', flexShrink: 0 }}>✓</span>
      )}
    </button>
  );
}

function BracketMatchCard({
  match, db, locked, isSaving, matchOrigIdx, round, matchesByRound, dbPredictions, onPredict,
}: {
  match: Match;
  db?: MatchPrediction;
  locked: boolean;
  isSaving: boolean;
  matchOrigIdx: number;
  round: KnockoutRound;
  matchesByRound: Record<string, Match[]>;
  dbPredictions: Record<string, MatchPrediction>;
  onPredict: (matchId: string, outcome: 'HOME_WIN' | 'AWAY_WIN') => void;
}) {
  const unlocked = isBracketMatchUnlocked(round, matchOrigIdx, matchesByRound, dbPredictions);
  return (
    <div className="card" style={{ padding: '3px 0', overflow: 'hidden', minWidth: 180, opacity: unlocked ? 1 : 0.6 }}>
      <div style={{ fontSize: 9, color: 'var(--muted)', padding: '2px 8px 1px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {match.group ? `Group ${match.group}` : new Date(match.kickoffTime).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
        {db?.isScored && (
          <span style={{ float: 'right', color: db.pointsAwarded > 0 ? 'var(--success)' : 'var(--danger)' }}>
            {db.pointsAwarded > 0 ? `+${db.pointsAwarded}pt` : '✗'}
          </span>
        )}
      </div>
      <BracketTeamRow
        team={match.homeTeam} outcome="HOME_WIN"
        predicted={db?.predictedOutcome} scored={db?.isScored} pointsAwarded={db?.pointsAwarded} actual={match.actualOutcome ?? undefined}
        locked={locked} isSaving={isSaving} unlocked={unlocked}
        onClick={() => onPredict(match.id, 'HOME_WIN')}
      />
      <div style={{ height: 1, background: 'var(--border)', margin: '1px 6px' }} />
      <BracketTeamRow
        team={match.awayTeam} outcome="AWAY_WIN"
        predicted={db?.predictedOutcome} scored={db?.isScored} pointsAwarded={db?.pointsAwarded} actual={match.actualOutcome ?? undefined}
        locked={locked} isSaving={isSaving} unlocked={unlocked}
        onClick={() => onPredict(match.id, 'AWAY_WIN')}
      />
    </div>
  );
}

function KnockoutBracket({
  matchesByRound, dbPredictions, locked, saving, activeRound, onPredict,
}: {
  matchesByRound: Record<string, Match[]>;
  dbPredictions: Record<string, MatchPrediction>;
  locked: boolean;
  saving: Record<string, boolean>;
  activeRound: KnockoutRound;
  onPredict: (matchId: string, outcome: 'HOME_WIN' | 'AWAY_WIN') => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const colRefs   = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    const col = colRefs.current[activeRound];
    if (col && scrollRef.current) {
      scrollRef.current.scrollTo({ left: col.offsetLeft - 16, behavior: 'smooth' });
    }
  }, [activeRound]);

  return (
    <BracketLayout<Match>
      rounds={KNOCKOUT_ROUNDS}
      roundLabels={ROUND_LABELS}
      matchesByRound={matchesByRound}
      activeRound={activeRound}
      scrollRef={scrollRef}
      colRefs={colRefs}
      renderCard={(match, round, origIdx) => (
        <BracketMatchCard
          match={match}
          db={dbPredictions[match.id]}
          locked={locked}
          isSaving={saving[match.id] || false}
          matchOrigIdx={origIdx}
          round={round as KnockoutRound}
          matchesByRound={matchesByRound}
          dbPredictions={dbPredictions}
          onPredict={onPredict}
        />
      )}
    />
  );
}

// ─── GroupMatchCard ────────────────────────────────────────────────────────

function GroupMatchCard({
  match, db, draft, isDirty, isSaving, locked,
  onGroupClick, onSetDraft, onSave, onSubmit, onDiscard,
}: {
  match: Match; db?: MatchPrediction; draft?: string; isDirty: boolean;
  isSaving: boolean; locked: boolean;
  onGroupClick: (outcome: string) => void;
  onSetDraft: (outcome: string) => void;
  onSave: () => void; onSubmit: () => void; onDiscard: () => void;
}) {
  const currentOutcome = draft || db?.predictedOutcome || '';

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <span style={{ fontWeight: 600 }}>{match.homeTeam}</span>
          <span style={{ color: 'var(--muted)', margin: '0 8px' }}>vs</span>
          <span style={{ fontWeight: 600 }}>{match.awayTeam}</span>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>
            {new Date(match.kickoffTime).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
          </span>
          {match.status === 'LIVE' && <span className="badge badge-success">LIVE</span>}
          {match.status === 'COMPLETED' && <span className="badge badge-info">FT</span>}
          {match.actualOutcome && (
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>({match.actualOutcome.replace('_', ' ')})</span>
          )}
          {db?.isScored && (
            <span className={`badge ${db.pointsAwarded > 0 ? 'badge-success' : 'badge-danger'}`}>
              {db.pointsAwarded > 0 ? `+${db.pointsAwarded} pt${db.pointsAwarded !== 1 ? 's' : ''}` : '0 pts'}
            </span>
          )}
        </div>
      </div>

      {!locked ? (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {(['HOME_WIN', 'DRAW', 'AWAY_WIN'] as const).map((outcome) => {
            const isSelected = db?.predictedOutcome === outcome;
            return (
              <button
                key={outcome}
                className={isSelected ? 'btn-primary' : 'btn-secondary'}
                style={{ fontSize: 13, padding: '5px 12px' }}
                onClick={() => onGroupClick(outcome)}
                disabled={isSaving}
              >
                {isSaving && isSelected ? <span className="spinner" /> :
                  outcome === 'HOME_WIN' ? `${match.homeTeam} Win` :
                  outcome === 'AWAY_WIN' ? `${match.awayTeam} Win` : 'Draw'}
              </button>
            );
          })}
          {db?.isSubmitted && !isSaving && <span style={{ fontSize: 11, color: 'var(--muted)' }}>✓ Saved</span>}
        </div>
      ) : (
        <div style={{ fontSize: 13, color: 'var(--muted)' }}>
          {db?.predictedOutcome ? (
            <>
              Prediction: <strong>{
                db.predictedOutcome === 'HOME_WIN' ? `${match.homeTeam} Win` :
                db.predictedOutcome === 'AWAY_WIN' ? `${match.awayTeam} Win` : 'Draw'
              }</strong>
              {db.isSubmitted && <span className="badge badge-info" style={{ marginLeft: 6 }}>Submitted</span>}
            </>
          ) : (
            'No prediction made (locked)'
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────

export default function PredictionsPage() {
  const { user, initialized } = useAuth();
  const router = useRouter();
  const { drafts, dirty, conflictMatches, setDraft, loadFromStorage, clearDraft, resolveConflict } = usePredictions();

  // Read ?stage= from URL to support deep-linking from home page CTAs
  const [topStage, setTopStage] = useState<'GROUP' | 'KNOCKOUT'>(() => {
    if (typeof window !== 'undefined') {
      const p = new URLSearchParams(window.location.search).get('stage');
      if (p === 'KNOCKOUT') return 'KNOCKOUT';
    }
    return 'GROUP';
  });
  const [groupSubView, setGroupSubView] = useState<'predictions' | 'standings'>('predictions');
  const [knockoutRound, setKnockoutRound] = useState<KnockoutRound>(DEFAULT_KNOCKOUT_ROUND);

  const [groupMatches, setGroupMatches] = useState<Match[]>([]);
  const [knockoutByRound, setKnockoutByRound] = useState<Record<string, Match[]>>({});
  const [knockoutLocked, setKnockoutLocked] = useState(false);

  const [dbPredictions, setDbPredictions] = useState<Record<string, MatchPrediction>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [toast, setToast] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (initialized && !user) router.replace('/');
  }, [initialized, user, router]);

  useEffect(() => {
    if (topStage === 'KNOCKOUT') {
      setKnockoutRound(DEFAULT_KNOCKOUT_ROUND);
    }
  }, [topStage]);

  const loadGroup = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { matches } = await getMatches('GROUP');
      setGroupMatches(matches);
      const predMap: Record<string, MatchPrediction> = {};
      for (const m of matches) if (m.predictions?.[0]) predMap[m.id] = m.predictions[0];
      setDbPredictions((p) => ({ ...p, ...predMap }));
      const dbMap: Record<string, { outcome: string; updatedAt: string }> = {};
      for (const [mid, pred] of Object.entries(predMap)) {
        dbMap[mid] = { outcome: pred.predictedOutcome, updatedAt: pred.updatedAt };
      }
      loadFromStorage(dbMap);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [loadFromStorage]);

  const loadKnockout = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const results = await Promise.all(KNOCKOUT_ROUNDS.map((r) => getMatches(r)));
      const byRound: Record<string, Match[]> = {};
      const predMap: Record<string, MatchPrediction> = {};
      results.forEach(({ matches, knockoutLocked: kl }, i) => {
        byRound[KNOCKOUT_ROUNDS[i]] = matches;
        if (i === 0) setKnockoutLocked(kl);
        for (const m of matches) if (m.predictions?.[0]) predMap[m.id] = m.predictions[0];
      });
      setKnockoutByRound(byRound);
      setDbPredictions((p) => ({ ...p, ...predMap }));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    if (topStage === 'GROUP') loadGroup();
    else loadKnockout();
  }, [user, topStage, loadGroup, loadKnockout]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  }

  async function handleGroupAutoSubmit(match: Match, outcome: string) {
    setSaving((s) => ({ ...s, [match.id]: true }));
    try {
      const pred = await savePrediction({ matchId: match.id, predictedOutcome: outcome, isSubmitted: true });
      setDbPredictions((p) => ({ ...p, [match.id]: pred }));
      clearDraft(match.id);
    } catch (err: any) {
      showToast(err.status === 410 ? 'Match has started — predictions locked' : (err.message || 'Failed to save'));
    } finally {
      setSaving((s) => ({ ...s, [match.id]: false }));
    }
  }

  async function handleKnockoutPredict(matchId: string, outcome: 'HOME_WIN' | 'AWAY_WIN') {
    setSaving((s) => ({ ...s, [matchId]: true }));
    try {
      const pred = await savePrediction({ matchId, predictedOutcome: outcome, isSubmitted: true });
      setDbPredictions((p) => ({ ...p, [matchId]: pred }));
    } catch (err: any) {
      showToast(err.status === 410 ? 'Bracket locked — cannot change predictions' : (err.message || 'Failed to save'));
    } finally {
      setSaving((s) => ({ ...s, [matchId]: false }));
    }
  }

  const isGroupLocked = (match: Match) =>
    new Date() > new Date(match.kickoffTime) || match.status !== 'UPCOMING';

  if (!initialized || !user) {
    return <div className="container" style={{ paddingTop: 40 }}><div className="spinner" /></div>;
  }

  return (
    <div className="container">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
        <h1 style={{ margin: 0 }}>My Predictions</h1>
        <ScoringTooltip />
      </div>
      <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 20 }}>
        Your predictions count across all leagues you join.
      </p>

      {/* Draft conflict banner */}
      {conflictMatches.length > 0 && (
        <div className="card" style={{ marginBottom: 16, borderColor: 'var(--warning)', background: '#1c1408' }}>
          <p style={{ marginBottom: 10, color: 'var(--warning)' }}>
            You have {conflictMatches.length} unsaved draft{conflictMatches.length > 1 ? 's' : ''} from a previous session.
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-primary" style={{ fontSize: 13 }} onClick={() => resolveConflict(true)}>Keep drafts</button>
            <button className="btn-secondary" style={{ fontSize: 13 }} onClick={() => resolveConflict(false)}>Discard</button>
          </div>
        </div>
      )}

      {/* Level 1: Stage selector */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 0 }}>
        {(['GROUP', 'KNOCKOUT'] as const).map((stage) => (
          <button
            key={stage}
            className={topStage === stage ? 'btn-primary' : 'btn-secondary'}
            style={{ fontSize: 15, padding: '8px 20px', fontWeight: 600 }}
            onClick={() => setTopStage(stage)}
          >
            {stage === 'GROUP' ? 'Group Stage' : 'Knockout Stage'}
          </button>
        ))}
      </div>

      {/* Level 2: Sub-tabs (underline style, visually distinct from level 1) */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)', marginBottom: 20, marginTop: 12, overflowX: 'auto', scrollbarWidth: 'none' }}>
        {topStage === 'GROUP' ? (
          <>
            <SubTab label="Match Predictions" active={groupSubView === 'predictions'} onClick={() => setGroupSubView('predictions')} />
            <SubTab label="Predicted Standings" active={groupSubView === 'standings'} onClick={() => setGroupSubView('standings')} />
          </>
        ) : (
          KNOCKOUT_ROUNDS.map((round) => (
            <SubTab key={round} label={ROUND_LABELS[round]} active={knockoutRound === round} onClick={() => setKnockoutRound(round)} />
          ))
        )}
      </div>

      {error && <p style={{ color: 'var(--danger)', marginBottom: 16 }}>{error}</p>}

      {loading ? (
        <div style={{ textAlign: 'center', paddingTop: 40 }}><div className="spinner" /></div>
      ) : topStage === 'KNOCKOUT' ? (
        <>
          {knockoutLocked ? (
            <div className="card" style={{ marginBottom: 12, borderColor: 'var(--danger)', background: '#1a0a0a', fontSize: 13, color: 'var(--muted)' }}>
              <strong style={{ color: 'var(--danger)' }}>Bracket locked.</strong> The knockout stage has begun — predictions can no longer be changed.
            </div>
          ) : (
            <div className="card" style={{ marginBottom: 12, borderColor: 'var(--warning)', background: '#1a1200', fontSize: 13, color: 'var(--muted)' }}>
              <strong style={{ color: 'var(--warning)' }}>Lock your bracket now.</strong> All knockout predictions lock when the first Round of 32 match kicks off.
            </div>
          )}
          <KnockoutBracket
            matchesByRound={knockoutByRound}
            dbPredictions={dbPredictions}
            locked={knockoutLocked}
            saving={saving}
            activeRound={knockoutRound}
            onPredict={handleKnockoutPredict}
          />
        </>
      ) : groupSubView === 'standings' ? (
        <GroupStandingsView matches={groupMatches} dbPredictions={dbPredictions} />
      ) : groupMatches.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', color: 'var(--muted)', padding: 40 }}>
          No matches for this stage yet.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {groupByDay(groupMatches).map(({ label, dayMatches }) => (
            <div key={label}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                margin: '20px 0 10px', color: 'var(--muted)',
                fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em',
              }}>
                <span style={{ whiteSpace: 'nowrap' }}>{label}</span>
                <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {dayMatches.map((match) => {
                  const db = dbPredictions[match.id];
                  const locked = isGroupLocked(match);
                  const draft = drafts[match.id];
                  const isDirty = !!dirty[match.id] && draft !== db?.predictedOutcome;
                  return (
                    <GroupMatchCard
                      key={match.id}
                      match={match} db={db} draft={draft} isDirty={isDirty}
                      isSaving={saving[match.id] || false} locked={locked}
                      onGroupClick={(outcome) => handleGroupAutoSubmit(match, outcome)}
                      onSetDraft={(outcome) => setDraft(match.id, outcome)}
                      onSave={() => handleKnockoutPredict(match.id, draft as 'HOME_WIN' | 'AWAY_WIN')}
                      onSubmit={() => {}}
                      onDiscard={() => clearDraft(match.id)}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
