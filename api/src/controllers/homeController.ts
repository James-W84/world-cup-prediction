import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';

const GROUP_STAGE = ['GROUP'];
const KNOCKOUT_STAGES = ['LAST_32', 'ROUND_OF_16', 'QF', 'SF', 'FINAL'];

async function getStageStats(userId: string, stages: string[]) {
  const [submitted, scored, correct] = await Promise.all([
    prisma.matchPrediction.count({
      where: { userId, isSubmitted: true, match: { stage: { in: stages as any[] } } },
    }),
    prisma.matchPrediction.count({
      where: { userId, isScored: true, match: { stage: { in: stages as any[] } } },
    }),
    prisma.matchPrediction.count({
      where: { userId, isScored: true, pointsAwarded: { gt: 0 }, match: { stage: { in: stages as any[] } } },
    }),
  ]);
  return { submitted, scored, correct };
}

export const homeController = {
  getDashboard: async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ success: false, error: 'Not authenticated' });
        return;
      }

      const offset = parseInt(req.query.offset as string || '0', 10);
      const limit = 8;

      const unpredictedWhere = (stages: string[]) => ({
        status: 'UPCOMING' as const,
        stage: { in: stages as any[] },
        NOT: { predictions: { some: { userId, isSubmitted: true } } },
      });

      const [upcomingMatches, totalUpcoming, groupStats, knockoutStats, groupPending, knockoutPending] = await Promise.all([
        prisma.match.findMany({
          where: { status: 'UPCOMING' },
          include: {
            predictions: {
              where: { userId },
              select: {
                id: true,
                predictedOutcome: true,
                isSubmitted: true,
                updatedAt: true,
              },
            },
          },
          orderBy: { kickoffTime: 'asc' },
          skip: offset,
          take: limit,
        }),
        prisma.match.count({ where: { status: 'UPCOMING' } }),
        getStageStats(userId, GROUP_STAGE),
        getStageStats(userId, KNOCKOUT_STAGES),
        prisma.match.count({ where: unpredictedWhere(GROUP_STAGE) }),
        prisma.match.count({ where: unpredictedWhere(KNOCKOUT_STAGES) }),
      ]);

      res.json({
        success: true,
        data: {
          upcomingMatches,
          totalUpcoming,
          pendingByStage: { group: groupPending, knockout: knockoutPending },
          predictionStats: {
            group: groupStats,
            knockout: knockoutStats,
          },
        },
      });
    } catch (error) {
      logger.error('Error fetching home dashboard', error);
      res.status(500).json({ success: false, error: 'Failed to fetch dashboard data' });
    }
  },
};
