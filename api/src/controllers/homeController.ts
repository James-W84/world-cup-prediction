import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';

export const homeController = {
  getDashboard: async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ success: false, error: 'Not authenticated' });
        return;
      }

      const [upcomingMatches, predictionStats] = await Promise.all([
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
          take: 8,
        }),
        prisma.matchPrediction.aggregate({
          where: { userId },
          _count: { id: true },
        }).then(async (total) => {
          const [submitted, correct] = await Promise.all([
            prisma.matchPrediction.count({ where: { userId, isSubmitted: true } }),
            prisma.matchPrediction.count({ where: { userId, isScored: true, pointsAwarded: { gt: 0 } } }),
          ]);
          const scored = await prisma.matchPrediction.count({ where: { userId, isScored: true } });
          return { total: total._count.id, submitted, scored, correct };
        }),
      ]);

      res.json({
        success: true,
        data: { upcomingMatches, predictionStats },
      });
    } catch (error) {
      logger.error('Error fetching home dashboard', error);
      res.status(500).json({ success: false, error: 'Failed to fetch dashboard data' });
    }
  },
};
