'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../store/auth';
import { usePredictions, saveDraftToStorage } from '../../store/predictions';
import { getMatches, savePrediction, submitPrediction, Match, MatchPrediction } from '../../lib/api';

function groupByDay(matches: Match[]): { label: string; dayMatches: Match[] }[] {
  const groups: { label: string; dayMatches: Match[] }[] = [];
  let lastKey = '';
  for (const match of matches) {
    const d = new Date(match.kickoffTime);
    const key = d.toLocaleDateString(undefined, { year: 'numeric', month: 'numeric', day: 'numeric' });
    const label = d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
    if (key !== lastKey) {
      groups.push({ label, dayMatches: [] });
      lastKey = key;
    }
    groups[groups.length - 1].dayMatches.push(match);
  }
  return groups;
}

const KNOCKOUT_STAGES = new Set(['LAST_32', 'ROUND_OF_16', 'QF', 'SF', 'FINAL']);

const STAGES = ['GROUP', 'LAST_32', 'ROUND_OF_16', 'QF', 'SF', 'FINAL'];
const STAGE_LABELS: Record<string, string> = {
  GROUP: 'Group Stage',
  LAST_32: 'Round of 32',
  ROUND_OF_16: 'Round of 16',
  QF: 'Quarterfinals',
  SF: 'Semifinals',
  FINAL: 'Final',
};

export default function PredictionsPage() {
  const { user, initialized } = useAuth();
  const router = useRouter();

  const { drafts, dirty, conflictMatches, setDraft, loadFromStorage, clearDraft, resolveConflict } = usePredictions();

  const [activeStage, setActiveStage] = useState('GROUP');
  const [matches, setMatches] = useState<Match[]>([]);
  const [knockoutLocked, setKnockoutLocked] = useState(false);
  const [dbPredictions, setDbPredictions] = useState<Record<string, MatchPrediction>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [toast, setToast] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (initialized && !user) router.replace('/');
  }, [initialized, user, router]);

  const loadMatches = useCallback(async (stage: string) => {
    setLoading(true);
    setError('');
    try {
      const { matches: data, knockoutLocked: locked } = await getMatches(stage);
      setMatches(data);
      setKnockoutLocked(locked);

      const predMap: Record<string, MatchPrediction> = {};
      for (const m of data) {
        if (m.predictions?.[0]) predMap[m.id] = m.predictions[0];
      }
      setDbPredictions(predMap);

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

  useEffect(() => {
    if (user) loadMatches(activeStage);
  }, [user, activeStage, loadMatches]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  }

  async function handleSave(match: Match, outcome: string) {
    setSaving((s) => ({ ...s, [match.id]: true }));
    try {
      const pred = await savePrediction({ matchId: match.id, predictedOutcome: outcome });
      setDbPredictions((p) => ({ ...p, [match.id]: pred }));
      clearDraft(match.id);
      showToast('Saved');
    } catch (err: any) {
      if (err.status === 410) {
        showToast('Predictions locked — match has started');
      } else {
        saveDraftToStorage(match.id, outcome);
        showToast('Saved locally (offline)');
      }
    } finally {
      setSaving((s) => ({ ...s, [match.id]: false }));
    }
  }

  async function handleSubmit(match: Match) {
    const pred = dbPredictions[match.id];
    if (!pred) return;
    setSaving((s) => ({ ...s, [match.id]: true }));
    try {
      const updated = await submitPrediction(pred.id);
      setDbPredictions((p) => ({ ...p, [match.id]: updated }));
      showToast('Prediction submitted!');
    } catch (err: any) {
      showToast(err.status === 410 ? 'Predictions locked — match has started' : err.message);
    } finally {
      setSaving((s) => ({ ...s, [match.id]: false }));
    }
  }

  const isLocked = (match: Match) => {
    if (KNOCKOUT_STAGES.has(match.stage)) return knockoutLocked;
    return new Date() > new Date(match.kickoffTime) || match.status !== 'UPCOMING';
  };

  if (!initialized || !user) {
    return <div className="container" style={{ paddingTop: 40 }}><div className="spinner" /></div>;
  }

  return (
    <div className="container">
      <h1 style={{ marginBottom: 4 }}>My Predictions</h1>
      <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 20 }}>
        Your predictions count across all leagues you join.
      </p>

      {conflictMatches.length > 0 && (
        <div className="card" style={{ marginBottom: 16, borderColor: 'var(--warning)', background: '#1c1408' }}>
          <p style={{ marginBottom: 10, color: 'var(--warning)' }}>
            You have {conflictMatches.length} unsaved draft{conflictMatches.length > 1 ? 's' : ''} from a previous session.
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-primary" style={{ fontSize: 13 }} onClick={() => resolveConflict(true)}>
              Keep drafts
            </button>
            <button className="btn-secondary" style={{ fontSize: 13 }} onClick={() => resolveConflict(false)}>
              Discard
            </button>
          </div>
        </div>
      )}

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

      {knockoutLocked && KNOCKOUT_STAGES.has(activeStage) && (
        <div className="card" style={{ marginBottom: 16, borderColor: 'var(--danger)', background: '#1a0a0a', fontSize: 13, color: 'var(--muted)' }}>
          <strong style={{ color: 'var(--danger)' }}>Bracket locked.</strong> The knockout stage has begun — predictions can no longer be changed.
        </div>
      )}

      {!knockoutLocked && KNOCKOUT_STAGES.has(activeStage) && (
        <div className="card" style={{ marginBottom: 16, borderColor: 'var(--warning)', background: '#1a1200', fontSize: 13, color: 'var(--muted)' }}>
          <strong style={{ color: 'var(--warning)' }}>Lock your bracket now.</strong> All knockout predictions lock when the first Round of 32 match kicks off. Points: R32=1, R16=2, QF/SF=3, Final=5.
        </div>
      )}

      {error && <p style={{ color: 'var(--danger)', marginBottom: 16 }}>{error}</p>}

      {loading ? (
        <div style={{ textAlign: 'center', paddingTop: 40 }}><div className="spinner" /></div>
      ) : matches.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', color: 'var(--muted)', padding: 40 }}>
          No matches for this stage yet.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {groupByDay(matches).map(({ label, dayMatches }) => (
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
                  const draft = drafts[match.id];
                  const currentOutcome = draft || db?.predictedOutcome || '';
                  const isDirty = !!dirty[match.id] && draft !== db?.predictedOutcome;
                  const locked = isLocked(match);
                  const isSaving = saving[match.id];

                  return (
                    <div key={match.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                        <div>
                          <span style={{ fontWeight: 600 }}>{match.homeTeam}</span>
                          <span style={{ color: 'var(--muted)', margin: '0 8px' }}>vs</span>
                          <span style={{ fontWeight: 600 }}>{match.awayTeam}</span>
                        </div>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                            {new Date(match.kickoffTime).toLocaleTimeString(undefined, {
                              hour: '2-digit', minute: '2-digit',
                            })}
                          </span>
                          {match.status === 'LIVE' && <span className="badge badge-success">LIVE</span>}
                          {match.status === 'COMPLETED' && <span className="badge badge-info">FT</span>}
                          {match.actualOutcome && (
                            <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                              ({match.actualOutcome.replace('_', ' ')})
                            </span>
                          )}
                          {db?.isScored && (
                            <span className={`badge ${db.pointsAwarded > 0 ? 'badge-success' : 'badge-danger'}`}>
                              {db.pointsAwarded > 0 ? '+1 pt' : '0 pts'}
                            </span>
                          )}
                        </div>
                      </div>

                      {!locked ? (
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                          {['HOME_WIN', ...(activeStage === 'GROUP' ? ['DRAW'] : []), 'AWAY_WIN'].map((outcome) => (
                            <button
                              key={outcome}
                              className={currentOutcome === outcome ? 'btn-primary' : 'btn-secondary'}
                              style={{ fontSize: 13, padding: '5px 12px' }}
                              onClick={() => setDraft(match.id, outcome)}
                              disabled={isSaving}
                            >
                              {outcome === 'HOME_WIN' ? `${match.homeTeam} Win` :
                                outcome === 'AWAY_WIN' ? `${match.awayTeam} Win` : 'Draw'}
                            </button>
                          ))}

                          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                            {isDirty && (
                              <button
                                className="btn-secondary"
                                style={{ fontSize: 13 }}
                                onClick={() => clearDraft(match.id)}
                                disabled={isSaving}
                              >
                                Discard
                              </button>
                            )}
                            {currentOutcome && (
                              <button
                                className="btn-primary"
                                style={{ fontSize: 13 }}
                                onClick={() => isDirty ? handleSave(match, currentOutcome) : handleSubmit(match)}
                                disabled={isSaving || (!isDirty && db?.isSubmitted)}
                              >
                                {isSaving ? <span className="spinner" /> :
                                  isDirty ? 'Save' :
                                  db?.isSubmitted ? '✓ Submitted' : 'Submit'}
                              </button>
                            )}
                          </div>

                          {isDirty && (
                            <span style={{ fontSize: 11, color: 'var(--warning)', width: '100%' }}>Unsaved changes</span>
                          )}
                        </div>
                      ) : (
                        <div style={{ fontSize: 13, color: 'var(--muted)' }}>
                          {db?.predictedOutcome ? (
                            <>
                              Your prediction: <strong>{db.predictedOutcome.replace('_', ' ')}</strong>
                              {db.isSubmitted && <span className="badge badge-info" style={{ marginLeft: 6 }}>Submitted</span>}
                            </>
                          ) : (
                            'No prediction made (locked)'
                          )}
                        </div>
                      )}
                    </div>
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
