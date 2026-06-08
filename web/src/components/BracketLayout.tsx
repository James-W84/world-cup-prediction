'use client';
import React from 'react';

// ─── Shared layout constants ──────────────────────────────────────────────────
export const BRACKET_CARD_H = 64;
export const BRACKET_UNIT   = BRACKET_CARD_H + 28; // 14px gap above + below each card
export const BRACKET_CARD_W = 196;
export const BRACKET_COL_GAP = 20;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BracketLayoutProps<T> {
  rounds: readonly string[];
  roundLabels: Record<string, string>;
  /**
   * Per-round match arrays. If the 'SF' round contains a 3rd item, it is
   * treated as the 3rd-place play-off and rendered separately below the bracket.
   */
  matchesByRound: Record<string, T[]>;
  renderCard: (match: T, round: string, origIdx: number) => React.ReactNode;
  /** Highlights this round's column header with accent colour. */
  activeRound?: string;
  /** Forwarded to the outer scroll container so callers can imperative-scroll. */
  scrollRef?: React.RefObject<HTMLDivElement | null>;
  /** Keyed by round name; forwarded to each column div so callers can scroll to a column. */
  colRefs?: React.MutableRefObject<Record<string, HTMLDivElement | null>>;
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
  // Separate the 3rd-place play-off from the SF column (index 2 of 'SF' array)
  const sfRaw         = (matchesByRound['SF'] || []) as T[];
  const sfMatches     = sfRaw.slice(0, 2);
  const thirdPlace    = sfRaw[2] ?? null;

  const adjusted: Record<string, T[]> = { ...matchesByRound, SF: sfMatches };

  const r32Count    = (adjusted['LAST_32'] || []).length;
  const totalUnits  = Math.max(r32Count, 1);
  const totalHeight = totalUnits * BRACKET_UNIT;

  return (
    <div>
      <div ref={scrollRef} style={{ overflowX: 'auto', paddingBottom: 8 }}>
        <div style={{
          display: 'flex', gap: BRACKET_COL_GAP, alignItems: 'flex-start',
          minWidth: 'max-content', padding: '4px 2px',
        }}>
          {rounds.map((round) => {
            const roundMatches = adjusted[round] || [];
            const count        = roundMatches.length;
            const slotsPerMatch = count > 0 ? totalUnits / count : totalUnits;
            const slotH        = slotsPerMatch * BRACKET_UNIT;
            const padY         = (slotH - BRACKET_CARD_H) / 2;
            const isActive     = round === activeRound;

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

      {/* 3rd-place play-off — always below the bracket, same width as a single card */}
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
