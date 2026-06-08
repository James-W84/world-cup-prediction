import { describe, it, expect } from 'vitest';
import { prisma } from '../lib/prisma';
import { scoreGroupTableBonuses } from '../jobs/score-cron';
import { createUser, createPrediction, setMatchCompleted } from './fixtures';

// Find any seeded group with exactly 6 matches and mark them all COMPLETED.
async function completeGroup(outcome = 'HOME_WIN') {
  const groups = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];
  for (const g of groups) {
    const matches = await prisma.match.findMany({ where: { stage: 'GROUP', group: g } });
    if (matches.length === 6) {
      for (const m of matches) await setMatchCompleted(m.id, outcome);
      return { matches, group: g };
    }
  }
  throw new Error('No group found with exactly 6 matches — ensure test.db is seeded');
}

describe('scoreGroupTableBonuses', () => {
  it('does not award bonus when group is incomplete', async () => {
    const user = await createUser();
    // Find any group with >= 6 matches and only complete 5
    const groups = ['L', 'K', 'J', 'I'];
    const groupLetter = groups[0];
    const allMatches = await prisma.match.findMany({ where: { stage: 'GROUP', group: groupLetter } });
    const partial = allMatches.slice(0, 5);
    for (const m of partial) {
      await setMatchCompleted(m.id, 'HOME_WIN');
      await createPrediction(user.id, m.id, 'HOME_WIN');
    }

    const result = await scoreGroupTableBonuses();

    expect(result.groupsScored).toBe(0);
    const bonus = await prisma.groupTableScore.findFirst({ where: { userId: user.id } });
    expect(bonus).toBeNull();
  });

  it('awards bonus points for correct position predictions', async () => {
    const user = await createUser();
    const { matches, group } = await completeGroup('HOME_WIN');
    for (const m of matches) {
      await createPrediction(user.id, m.id, 'HOME_WIN');
    }

    await scoreGroupTableBonuses();

    const bonus = await prisma.groupTableScore.findUniqueOrThrow({
      where: { userId_group: { userId: user.id, group } },
    });
    expect(bonus.pointsAwarded).toBeGreaterThan(0);

    const updatedUser = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(updatedUser.totalPoints).toBe(bonus.pointsAwarded);
  });

  it('awards 0 bonus points (creates record) when all predictions are wrong', async () => {
    const user = await createUser();
    const { matches, group } = await completeGroup('HOME_WIN');
    for (const m of matches) {
      await createPrediction(user.id, m.id, 'AWAY_WIN');
    }

    await scoreGroupTableBonuses();

    const bonus = await prisma.groupTableScore.findUniqueOrThrow({
      where: { userId_group: { userId: user.id, group } },
    });
    expect(bonus.pointsAwarded).toBe(0);

    const updatedUser = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(updatedUser.totalPoints).toBe(0);
  });

  it('is idempotent — running twice creates no duplicate records', async () => {
    const user = await createUser();
    const { matches, group } = await completeGroup('HOME_WIN');
    for (const m of matches) {
      await createPrediction(user.id, m.id, 'HOME_WIN');
    }

    await scoreGroupTableBonuses();
    await scoreGroupTableBonuses();

    const bonuses = await prisma.groupTableScore.findMany({ where: { userId: user.id, group } });
    expect(bonuses).toHaveLength(1);

    const updatedUser = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(updatedUser.totalPoints).toBe(bonuses[0].pointsAwarded);
  });

  it('scores multiple users independently for the same group', async () => {
    const userA = await createUser();
    const userB = await createUser();
    const { matches, group } = await completeGroup('HOME_WIN');

    for (const m of matches) {
      await createPrediction(userA.id, m.id, 'HOME_WIN');
      await createPrediction(userB.id, m.id, 'AWAY_WIN');
    }

    await scoreGroupTableBonuses();

    const bonusA = await prisma.groupTableScore.findUnique({
      where: { userId_group: { userId: userA.id, group } },
    });
    const bonusB = await prisma.groupTableScore.findUnique({
      where: { userId_group: { userId: userB.id, group } },
    });
    expect(bonusA).not.toBeNull();
    expect(bonusB).not.toBeNull();
  });

  it('returns correct groupsScored count', async () => {
    const user = await createUser();
    const { matches } = await completeGroup('HOME_WIN');
    for (const m of matches) {
      await createPrediction(user.id, m.id, 'HOME_WIN');
    }

    const result = await scoreGroupTableBonuses();
    expect(result.groupsScored).toBe(1);
  });
});
