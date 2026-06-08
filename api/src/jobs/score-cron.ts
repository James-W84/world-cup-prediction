import cron from 'node-cron';
import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';
import { syncMatchesFromApi } from './sync-matches';

// Points awarded for a correct prediction per stage
const STAGE_POINTS: Record<string, number> = {
  GROUP: 1,
  LAST_32: 1,
  ROUND_OF_16: 2,
  QF: 3,
  SF: 3,
  FINAL: 5,
};

// Derive W/D/L-based group table from a list of match outcomes.
// Ties broken by: points → wins → alphabetical (no scores available).
export function computeGroupTable(
  matches: { homeTeam: string; awayTeam: string; outcome: string | null }[]
): string[] {
  const records = new Map<string, { points: number; wins: number }>();

  const ensure = (team: string) => {
    if (!records.has(team)) records.set(team, { points: 0, wins: 0 });
  };

  for (const m of matches) {
    ensure(m.homeTeam);
    ensure(m.awayTeam);
    if (!m.outcome) continue;

    const home = records.get(m.homeTeam)!;
    const away = records.get(m.awayTeam)!;

    if (m.outcome === 'HOME_WIN') {
      home.points += 3;
      home.wins += 1;
    } else if (m.outcome === 'AWAY_WIN') {
      away.points += 3;
      away.wins += 1;
    } else {
      home.points += 1;
      away.points += 1;
    }
  }

  return Array.from(records.entries())
    .sort(([nameA, a], [nameB, b]) =>
      b.points - a.points || b.wins - a.wins || nameA.localeCompare(nameB)
    )
    .map(([name]) => name);
}

export async function scoreCompletedMatches(): Promise<{
  scoredCount: number;
  usersAffected: number;
  pointsAggregated: number;
}> {
  logger.info('Starting match scoring run...');

  const completedMatches = await prisma.match.findMany({
    where: { status: 'COMPLETED' },
    include: {
      predictions: { where: { isScored: false } },
    },
  });

  let scoredCount = 0;
  const userPointsMap: Record<string, number> = {};

  for (const match of completedMatches) {
    if (!match.actualOutcome) continue;

    const stagePoints = STAGE_POINTS[match.stage] ?? 1;

    for (const prediction of match.predictions) {
      const correct = prediction.predictedOutcome === match.actualOutcome;
      const pointsAwarded = correct ? stagePoints : 0;

      await prisma.matchPrediction.update({
        where: { id: prediction.id },
        data: { isScored: true, scoredAt: new Date(), pointsAwarded },
      });

      if (correct) {
        userPointsMap[prediction.userId] = (userPointsMap[prediction.userId] ?? 0) + pointsAwarded;
      }
      scoredCount++;
    }
  }

  await Promise.all(
    Object.entries(userPointsMap).map(([userId, points]) =>
      prisma.user.update({
        where: { id: userId },
        data: { totalPoints: { increment: points } },
      })
    )
  );

  const result = {
    scoredCount,
    usersAffected: Object.keys(userPointsMap).length,
    pointsAggregated: Object.values(userPointsMap).reduce((a, b) => a + b, 0),
  };

  logger.info(`Match scoring done: ${JSON.stringify(result)}`);
  return result;
}

export async function scoreGroupTableBonuses(): Promise<{ groupsScored: number; bonusPointsAwarded: number }> {
  logger.info('Checking group table bonuses...');

  const GROUPS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];
  let groupsScored = 0;
  let bonusPointsAwarded = 0;

  for (const group of GROUPS) {
    const groupMatches = await prisma.match.findMany({
      where: { stage: 'GROUP', group },
    });

    // A group has C(4,2)=6 matches; skip if not all complete
    if (
      groupMatches.length !== 6 ||
      !groupMatches.every((m) => m.status === 'COMPLETED' && m.actualOutcome != null)
    ) {
      continue;
    }

    // Find users already scored for this group
    const alreadyScored = await prisma.groupTableScore.findMany({
      where: { group },
      select: { userId: true },
    });
    const scoredIds = new Set(alreadyScored.map((s) => s.userId));

    // Build actual table
    const actualTable = computeGroupTable(
      groupMatches.map((m) => ({ homeTeam: m.homeTeam, awayTeam: m.awayTeam, outcome: m.actualOutcome }))
    );

    // Get all users with predictions for this group
    const matchIds = groupMatches.map((m) => m.id);
    const allPreds = await prisma.matchPrediction.findMany({
      where: { matchId: { in: matchIds } },
    });

    // Group by userId
    const byUser = new Map<string, typeof allPreds>();
    for (const p of allPreds) {
      if (!byUser.has(p.userId)) byUser.set(p.userId, []);
      byUser.get(p.userId)!.push(p);
    }

    for (const [userId, preds] of byUser.entries()) {
      if (scoredIds.has(userId)) continue;

      const predMap = new Map(preds.map((p) => [p.matchId, p.predictedOutcome]));
      const predictedTable = computeGroupTable(
        groupMatches.map((m) => ({
          homeTeam: m.homeTeam,
          awayTeam: m.awayTeam,
          outcome: predMap.get(m.id) ?? null,
        }))
      );

      let bonus = 0;
      for (let i = 0; i < actualTable.length; i++) {
        if (predictedTable[i] === actualTable[i]) bonus++;
      }

      await prisma.$transaction([
        prisma.groupTableScore.create({ data: { userId, group, pointsAwarded: bonus } }),
        ...(bonus > 0
          ? [prisma.user.update({ where: { id: userId }, data: { totalPoints: { increment: bonus } } })]
          : []),
      ]);

      bonusPointsAwarded += bonus;
    }

    groupsScored++;
    logger.info(`Group ${group} table scored. Actual: [${actualTable.join(', ')}]`);
  }

  logger.info(`Group table bonuses: ${groupsScored} groups, ${bonusPointsAwarded} bonus pts`);
  return { groupsScored, bonusPointsAwarded };
}

export function scheduleScoringCron(): void {
  cron.schedule('*/5 * * * *', async () => {
    try {
      await syncMatchesFromApi();
      await scoreCompletedMatches();
      await scoreGroupTableBonuses();
    } catch (err) {
      logger.error('Cron run failed', err);
    }
  });

  logger.info('Scoring cron scheduled (every 5 minutes)');
}
