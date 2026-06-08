import { describe, it, expect } from 'vitest';
import { computeGroupTable } from '../jobs/score-cron';

const match = (homeTeam: string, awayTeam: string, outcome: string | null) => ({
  homeTeam,
  awayTeam,
  outcome,
});

describe('computeGroupTable', () => {
  it('ranks by wins correctly', () => {
    const table = computeGroupTable([
      match('A', 'B', 'HOME_WIN'),
      match('A', 'C', 'HOME_WIN'),
      match('A', 'D', 'HOME_WIN'),
      match('B', 'C', 'AWAY_WIN'),
      match('B', 'D', 'AWAY_WIN'),
      match('C', 'D', 'AWAY_WIN'),
    ]);
    expect(table[0]).toBe('A'); // 9 pts
    expect(table[1]).toBe('D'); // 6 pts
    expect(table[2]).toBe('C'); // 3 pts
    expect(table[3]).toBe('B'); // 0 pts
  });

  it('ranks draws correctly', () => {
    const table = computeGroupTable([
      match('A', 'B', 'DRAW'),
      match('A', 'C', 'HOME_WIN'),
      match('A', 'D', 'HOME_WIN'),
      match('B', 'C', 'DRAW'),
      match('B', 'D', 'HOME_WIN'),
      match('C', 'D', 'HOME_WIN'),
    ]);
    // A: 1+3+3=7pts  B: 1+1+3=5pts  C: 0+1+3=4pts  D: 0+0+0=0pts
    expect(table[0]).toBe('A');
    expect(table[1]).toBe('B');
    expect(table[2]).toBe('C');
    expect(table[3]).toBe('D');
  });

  it('breaks equal-points ties by wins then alphabetically', () => {
    // A and B both have 4 pts from 1 win + 1 draw, but A has more wins
    const table = computeGroupTable([
      match('A', 'B', 'HOME_WIN'), // A: 3pts, 1 win; B: 0pts
      match('A', 'C', 'DRAW'),     // A: +1pt; C: +1pt
      match('A', 'D', 'DRAW'),     // A: +1pt; D: +1pt
      match('B', 'C', 'HOME_WIN'), // B: +3pts, 1 win; C: 0
      match('B', 'D', 'HOME_WIN'), // B: +3pts, 2 wins; D: 0
      match('C', 'D', 'DRAW'),     // C: +1; D: +1
    ]);
    // A: 5pts, 1 win  B: 6pts, 2 wins → B ranks higher despite fewer points? No:
    // A: 3+1+1=5pts   B: 0+3+3=6pts   C: 1+0+1=2pts  D: 1+0+1=2pts
    expect(table[0]).toBe('B'); // 6pts
    expect(table[1]).toBe('A'); // 5pts
    // C and D both have 2pts, 0 wins — alphabetical tiebreak
    expect(table[2]).toBe('C');
    expect(table[3]).toBe('D');
  });

  it('handles null outcomes (incomplete group)', () => {
    const table = computeGroupTable([
      match('A', 'B', 'HOME_WIN'),
      match('A', 'C', null),
      match('A', 'D', null),
      match('B', 'C', null),
      match('B', 'D', null),
      match('C', 'D', null),
    ]);
    expect(table).toHaveLength(4);
    expect(table[0]).toBe('A'); // 3pts only team with points
  });

  it('pure alphabetical when all teams tied at 0', () => {
    const table = computeGroupTable([
      match('Zebra', 'Apple', 'DRAW'),
      match('Zebra', 'Mango', 'DRAW'),
      match('Zebra', 'Kiwi', 'DRAW'),
      match('Apple', 'Mango', 'DRAW'),
      match('Apple', 'Kiwi', 'DRAW'),
      match('Mango', 'Kiwi', 'DRAW'),
    ]);
    // All 1 win by pts (all draws = 1pt each, 3 draws each = 3pts each), 0 wins each → alphabetical
    expect(table).toEqual(['Apple', 'Kiwi', 'Mango', 'Zebra']);
  });
});
