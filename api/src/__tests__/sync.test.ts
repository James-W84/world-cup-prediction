import { describe, it, expect, vi, beforeEach as viBeforeEach } from 'vitest';
import { prisma } from '../lib/prisma';

vi.mock('../lib/football-data', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../lib/football-data')>();
  return { ...mod, fetchWCMatches: vi.fn() };
});

import { syncMatchesFromApi } from '../jobs/sync-matches';
import { fetchWCMatches } from '../lib/football-data';

const mockFetch = fetchWCMatches as ReturnType<typeof vi.fn>;

const TEST_IDS = [99001, 99002, 99003, 99010, 99011, 99012];

viBeforeEach(async () => {
  mockFetch.mockReset();
  await prisma.match.deleteMany({ where: { footballDataId: { in: TEST_IDS } } });
});

function makeFDMatch(overrides: Partial<{
  id: number; stage: string; group: string | null;
  homeTeam: string; awayTeam: string;
  status: string; winner: string | null;
}> = {}) {
  const o = { id: 99001, stage: 'GROUP_STAGE', group: 'GROUP_A', homeTeam: 'TeamX', awayTeam: 'TeamY', status: 'SCHEDULED', winner: null, ...overrides };
  return {
    id: o.id,
    utcDate: '2026-06-15T12:00:00Z',
    status: o.status,
    stage: o.stage,
    group: o.group,
    matchday: 1,
    homeTeam: { id: 1, name: o.homeTeam, shortName: 'TX', tla: 'TX', crest: '' },
    awayTeam: { id: 2, name: o.awayTeam, shortName: 'TY', tla: 'TY', crest: '' },
    score: {
      winner: o.winner,
      duration: 'REGULAR' as const,
      fullTime: { home: null, away: null },
      halfTime: { home: null, away: null },
    },
    lastUpdated: '2026-06-15T12:00:00Z',
  };
}

describe('syncMatchesFromApi', () => {
  it('returns {created:0, updated:0} when API throws', async () => {
    mockFetch.mockRejectedValueOnce(new Error('API down'));

    const result = await syncMatchesFromApi();

    expect(result).toEqual({ created: 0, updated: 0 });
  });

  it('creates a new match when footballDataId is unknown', async () => {
    mockFetch.mockResolvedValueOnce([makeFDMatch({ id: 99001 })]);

    const result = await syncMatchesFromApi();

    expect(result.created).toBe(1);
    expect(result.updated).toBe(0);

    const match = await prisma.match.findUnique({ where: { footballDataId: 99001 } });
    expect(match).not.toBeNull();
    expect(match?.homeTeam).toBe('TeamX');
  });

  it('updates all fields for GROUP stage matches', async () => {
    const existing = await prisma.match.create({
      data: {
        footballDataId: 99002,
        homeTeam: 'OldHome',
        awayTeam: 'OldAway',
        kickoffTime: new Date('2026-06-15T12:00:00Z'),
        stage: 'GROUP',
        group: 'A',
      },
    });

    mockFetch.mockResolvedValueOnce([
      makeFDMatch({ id: 99002, homeTeam: 'NewHome', awayTeam: 'NewAway', status: 'IN_PLAY' }),
    ]);

    const result = await syncMatchesFromApi();

    expect(result.updated).toBe(1);
    const updated = await prisma.match.findUnique({ where: { id: existing.id } });
    expect(updated?.homeTeam).toBe('NewHome');
    expect(updated?.awayTeam).toBe('NewAway');
    expect(updated?.status).toBe('LIVE');
  });

  it('only updates status and outcome for knockout matches (preserves team names)', async () => {
    const existing = await prisma.match.create({
      data: {
        footballDataId: 99003,
        homeTeam: 'Winner Group A',
        awayTeam: 'Runner-up Group B',
        kickoffTime: new Date('2026-07-01T12:00:00Z'),
        stage: 'LAST_32',
        group: null,
      },
    });

    mockFetch.mockResolvedValueOnce([
      makeFDMatch({ id: 99003, stage: 'LAST_32', group: null, homeTeam: 'TeamX', awayTeam: 'TeamY', status: 'FINISHED', winner: 'HOME_TEAM' }),
    ]);

    await syncMatchesFromApi();

    const updated = await prisma.match.findUnique({ where: { id: existing.id } });
    expect(updated?.homeTeam).toBe('Winner Group A'); // preserved
    expect(updated?.awayTeam).toBe('Runner-up Group B'); // preserved
    expect(updated?.status).toBe('COMPLETED');
    expect(updated?.actualOutcome).toBe('HOME_WIN');
  });

  it('syncs multiple matches in one call', async () => {
    mockFetch.mockResolvedValueOnce([
      makeFDMatch({ id: 99010, homeTeam: 'A', awayTeam: 'B' }),
      makeFDMatch({ id: 99011, homeTeam: 'C', awayTeam: 'D' }),
      makeFDMatch({ id: 99012, homeTeam: 'E', awayTeam: 'F' }),
    ]);

    const result = await syncMatchesFromApi();
    expect(result.created).toBe(3);
  });
});
