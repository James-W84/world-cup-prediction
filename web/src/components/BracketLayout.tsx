'use client';
import React, { useState, useEffect } from 'react';

// ─── Shared layout constants ──────────────────────────────────────────────────
export const BRACKET_CARD_H = 64;
export const BRACKET_UNIT   = BRACKET_CARD_H + 28;
export const BRACKET_CARD_W = 196;
export const BRACKET_COL_GAP = 20;

const MOBILE_ROUND_LABELS: Record<string, string> = {
  LAST_32:      'R32',
  ROUND_OF_16:  'R16',
  QF:           'QF',
  SF:           'SF',
  FINAL:        'Final',
};

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BracketLayoutProps<T> {
  rounds: readonly string[];
  roundLabels: Record<string, string>;
  /**
   * Per-round match arrays. If the 'SF' round contains a 3rd item, it is
   * treated as the 3rd-place play-off and rendered separately below SF matches.
   */
  matchesByRound: Record<string, T[]>;
  renderCard: (match: T, round: string, origIdx: number) => React.ReactNode;
  /** Highlights this round's column header (desktop) and selects tab (mobile). */
  activeRound?: string;
  /** Forwarded to the outer scroll container so callers can imperative-scroll. */
  scrollRef?: React.RefObject<HTMLDivElement | null>;
  /** Keyed by round name; forwarded to each column div so callers can scroll to a column. */
  colRefs?: React.MutableRefObject<Record<string, HTMLDivElement | null>>;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 640px)');
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return isMobile;
}

// ─── Mobile: round-tabs + vertical card list ──────────────────────────────────

function MobileBracket<T>({
  rounds,
  roundLabels,
  matchesByRound,
  renderCard,
  activeRound,
}: Omit<BracketLayoutProps<T>, 'scrollRef' | 'colRefs'>) {
  const sfRaw     = (matchesByRound['SF'] || []) as T[];
  const sfMatches = sfRaw.slice(0, 2);
  const thirdPlace = sfRaw[2] ?? null;
  const adjusted: Record<string, T[]> = { ...matchesByRound, SF: sfMatches };

  // Default to activeRound, then first round that has any matches, then first round
  const defaultRound =
    activeRound ??
    rounds.find((r) => (adjusted[r] ?? []).length > 0) ??
    rounds[0];

  const [selectedRound, setSelectedRound] = useState(defaultRound);

  // Sync when parent advances activeRound (e.g. after submitting predictions)
  useEffect(() => {
    if (activeRound) setSelectedRound(activeRound);
  }, [activeRound]);

  const roundMatches = adjusted[selectedRound] ?? [];
  const showThirdPlace = selectedRound === 'SF' && thirdPlace;

  return (
    <div>
      {/* Round tab strip */}
      <div style={{
        display: 'flex', gap: 4, overflowX: 'auto', paddingBottom: 2,
        marginBottom: 16, scrollbarWidth: 'none',
      }}>
        {rounds.map((round) => {
          const isSelected = round === selectedRound;
          const hasMatches = (adjusted[round] ?? []).length > 0;
          return (
            <button
              key={round}
              onClick={() => setSelectedRound(round)}
              style={{
                flexShrink: 0,
                padding: '6px 14px',
                fontSize: 12,
                fontWeight: 700,
                borderRadius: 'var(--radius)',
                border: 'none',
                background: isSelected ? 'var(--accent)' : 'var(--surface)',
                color: isSelected ? '#fff' : hasMatches ? 'var(--text)' : 'var(--muted)',
                borderBottom: isSelected ? undefined : '2px solid transparent',
                cursor: 'pointer',
              }}
            >
              {MOBILE_ROUND_LABELS[round] ?? roundLabels[round] ?? round}
            </button>
          );
        })}
      </div>

      {/* Round label */}
      <div style={{
        fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
        letterSpacing: '0.08em', color: 'var(--accent)',
        marginBottom: 12,
      }}>
        {roundLabels[selectedRound] ?? selectedRound}
      </div>

      {/* Match cards — full width, vertical */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {roundMatches.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', color: 'var(--muted)', padding: 32 }}>
            TBD
          </div>
        ) : (
          roundMatches.map((match, origIdx) => (
            <div key={origIdx}>
              {renderCard(match, selectedRound, origIdx)}
            </div>
          ))
        )}
      </div>

      {/* 3rd-place play-off shown below SF matches */}
      {showThirdPlace && (
        <div style={{ marginTop: 20 }}>
          <div style={{
            fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
            letterSpacing: '0.08em', color: 'var(--muted)', marginBottom: 10,
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <span style={{ whiteSpace: 'nowrap' }}>3rd Place Play-off</span>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          </div>
          {renderCard(thirdPlace!, 'SF', 2)}
        </div>
      )}
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function BracketLayout<T>({
  rounds,
  roundLabels,
  matchesByRound,
  renderCard,
  activeRound,
  scrollRef,
  colRefs,
}: BracketLayoutProps<T>) {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <MobileBracket
        rounds={rounds}
        roundLabels={roundLabels}
        matchesByRound={matchesByRound}
        renderCard={renderCard}
        activeRound={activeRound}
      />
    );
  }

  // ── Desktop: original horizontal bracket ────────────────────────────────────
  const sfRaw      = (matchesByRound['SF'] || []) as T[];
  const sfMatches  = sfRaw.slice(0, 2);
  const thirdPlace = sfRaw[2] ?? null;
  const adjusted: Record<string, T[]> = { ...matchesByRound, SF: sfMatches };

  const r32Count   = (adjusted['LAST_32'] || []).length;
  const totalUnits = Math.max(r32Count, 1);
  const totalHeight = totalUnits * BRACKET_UNIT;

  return (
    <div>
      <div ref={scrollRef} style={{ overflowX: 'auto', paddingBottom: 8 }}>
        <div style={{
          display: 'flex', gap: BRACKET_COL_GAP, alignItems: 'flex-start',
          minWidth: 'max-content', padding: '4px 2px',
        }}>
          {rounds.map((round) => {
            const roundMatches  = adjusted[round] || [];
            const count         = roundMatches.length;
            const slotsPerMatch = count > 0 ? totalUnits / count : totalUnits;
            const slotH         = slotsPerMatch * BRACKET_UNIT;
            const padY          = (slotH - BRACKET_CARD_H) / 2;
            const isActive      = round === activeRound;

            return (
              <div
                key={round}
                ref={colRefs ? (el) => { colRefs.current[round] = el; } : undefined}
                style={{ width: BRACKET_CARD_W, flexShrink: 0 }}
              >
                <div style={{
                  fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em',
                  color: isActive ? 'var(--accent)' : 'var(--muted)',
                  marginBottom: 8, textAlign: 'center', whiteSpace: 'nowrap',
                  borderBottom: isActive ? '2px solid var(--accent)' : '2px solid transparent',
                  paddingBottom: 4,
                }}>
                  {roundLabels[round] ?? round}
                </div>

                <div style={{ height: totalHeight, display: 'flex', flexDirection: 'column' }}>
                  {count === 0 ? (
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ fontSize: 11, color: 'var(--muted)' }}>TBD</span>
                    </div>
                  ) : (
                    roundMatches.map((match, origIdx) => (
                      <div
                        key={origIdx}
                        style={{
                          height: slotH, display: 'flex', alignItems: 'center',
                          paddingTop: padY, paddingBottom: padY, boxSizing: 'border-box',
                        }}
                      >
                        {renderCard(match, round, origIdx)}
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {thirdPlace && (
        <div style={{ marginTop: 24 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10,
            color: 'var(--muted)', fontSize: 11, fontWeight: 700,
            textTransform: 'uppercase', letterSpacing: '0.08em',
          }}>
            <span style={{ whiteSpace: 'nowrap' }}>3rd Place Play-off</span>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          </div>
          <div style={{ maxWidth: BRACKET_CARD_W }}>
            {renderCard(thirdPlace, 'SF', 2)}
          </div>
        </div>
      )}
    </div>
  );
}
