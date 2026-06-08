import { describe, it, expect } from 'vitest';
import { prisma } from '../lib/prisma';
import { scoreCompletedMatches } from '../jobs/score-cron';
import { createUser, createPrediction, setMatchCompleted } from './fixtures';

describe('scoreCompletedMatches', () => {
  it('awards correct points per stage', async () => {
    const STAGE_CASES = [
      { stage: 'GROUP', expected: 1 },
      { stage: 'LAST_32', expected: 1 },
      { stage: 'ROUND_OF_16', expected: 2 },
      { stage: 'QF', expected: 3 },
      { stage: 'SF', expected: 3 },
      { stage: 'FINAL', expected: 5 },
    ] as const;

    for (const { stage, expected } of STAGE_CASES) {
      const user = await createUser();
      const match = await prisma.match.findFirstOrThrow({ where: { stage } });
      await createPrediction(user.id, match.id, 'HOME_WIN');
      await setMatchCompleted(match.id, 'HOME_WIN');

      await scoreCompletedMatches();

      const scored = await prisma.matchPrediction.findUniqueOrThrow({
        where: { userId_matchId: { userId: user.id, matchId: match.id } },
      });
      expect(scored.pointsAwarded).toBe(expected);
      expect(scored.isScored).toBe(true);

      const updatedUser = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(updatedUser.totalPoints).toBe(expected);
    }
  });

  it('awards 0 points for wrong prediction but marks as scored', async () => {
    const user = await createUser();
    const match = await prisma.match.findFirstOrThrow({ where: { stage: 'GROUP' } });
    await createPrediction(user.id, match.id, 'HOME_WIN');
    await setMatchCompleted(match.id, 'AWAY_WIN');

    await scoreCompletedMatches();

    const scored = await prisma.matchPrediction.findUniqueOrThrow({
      where: { userId_matchId: { userId: user.id, matchId: match.id } },
    });
    expect(scored.pointsAwarded).toBe(0);
    expect(scored.isScored).toBe(true);

    const updatedUser = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(updatedUser.totalPoints).toBe(0);
  });

  it('is idempotent — running twice does not double-score', async () => {
    const user = await createUser();
    const match = await prisma.match.findFirstOrThrow({ where: { stage: 'GROUP' } });
    await createPrediction(user.id, match.id, 'HOME_WIN');
    await setMatchCompleted(match.id, 'HOME_WIN');

    await scoreCompletedMatches();
    await scoreCompletedMatches();

    const updatedUser = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(updatedUser.totalPoints).toBe(1); // not 2
  });

  it('skips matches with null actualOutcome', async () => {
    const user = await createUser();
    const match = await prisma.match.findFirstOrThrow({ where: { stage: 'GROUP' } });
    await createPrediction(user.id, match.id, 'HOME_WIN');
    // Set to COMPLETED but leave actualOutcome null
    await prisma.match.update({
      where: { id: match.id },
      data: { status: 'COMPLETED' as any, actualOutcome: null },
    });

    const result = await scoreCompletedMatches();

    expect(result.scoredCount).toBe(0);
    const pred = await prisma.matchPrediction.findUniqueOrThrow({
      where: { userId_matchId: { userId: user.id, matchId: match.id } },
    });
    expect(pred.isScored).toBe(false);
  });

  it('scores multiple users on the same match', async () => {
    const userA = await createUser();
    const userB = await createUser();
    const match = await prisma.match.findFirstOrThrow({ where: { stage: 'QF' } });
    await createPrediction(userA.id, match.id, 'HOME_WIN');
    await createPrediction(userB.id, match.id, 'AWAY_WIN');
    await setMatchCompleted(match.id, 'HOME_WIN');

    await scoreCompletedMatches();

    const uA = await prisma.user.findUniqueOrThrow({ where: { id: userA.id } });
    const uB = await prisma.user.findUniqueOrThrow({ where: { id: userB.id } });
    expect(uA.totalPoints).toBe(3);
    expect(uB.totalPoints).toBe(0);
  });

  it('returns correct counts', async () => {
    const user = await createUser();
    const matches = await prisma.match.findMany({ where: { stage: 'GROUP' }, take: 3 });
    for (const m of matches) {
      await createPrediction(user.id, m.id, 'HOME_WIN');
      await setMatchCompleted(m.id, 'HOME_WIN');
    }

    const result = await scoreCompletedMatches();

    expect(result.scoredCount).toBe(3);
    expect(result.usersAffected).toBe(1);
    expect(result.pointsAggregated).toBe(3);
  });
});
