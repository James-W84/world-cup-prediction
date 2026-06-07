import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthenticatedRequest } from '../types';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();

export const cronController = {
  score: async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      // Optional: Verify admin/API key check
      const apiKey = req.headers['x-api-key'];
      const expectedKey = process.env.CRON_API_KEY || 'dev-key';

      if (apiKey !== expectedKey) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      logger.info('🔄 Starting scoring cron job...');

      // Query all COMPLETED matches with unscore d predictions
      const completedMatches = await prisma.match.findMany({
        where: { status: 'COMPLETED' },
        include: {
          predictions: {
            where: { isScored: false },
            include: { user: true },
          },
        },
      });

      let totalScoredCount = 0;
      const userPointsMap: Record<string, number> = {};

      // Process each completed match
      for (const match of completedMatches) {
        if (!match.actualOutcome) {
          logger.warn(`Skipping match ${match.id}: no actual outcome set`);
          continue;
        }

        // Score all unscore d predictions for this match
        for (const prediction of match.predictions) {
          if (prediction.predictedOutcome === match.actualOutcome) {
            // Correct prediction: award 1 point
            const pointsToAward = 1;

            // Update prediction
            await prisma.matchPrediction.update({
              where: { id: prediction.id },
              data: {
                isScored: true,
                scoredAt: new Date(),
                pointsAwarded: pointsToAward,
              },
            });

            // Track points for batch update
            if (!userPointsMap[prediction.userId]) {
              userPointsMap[prediction.userId] = 0;
            }
            userPointsMap[prediction.userId] += pointsToAward;

            totalScoredCount++;
          } else {
            // Incorrect prediction: no points
            await prisma.matchPrediction.update({
              where: { id: prediction.id },
              data: {
                isScored: true,
                scoredAt: new Date(),
                pointsAwarded: 0,
              },
            });

            totalScoredCount++;
          }
        }
      }

      // Batch update user total points
      for (const [userId, points] of Object.entries(userPointsMap)) {
        await prisma.user.update({
          where: { id: userId },
          data: {
            totalPoints: {
              increment: points,
            },
          },
        });
      }

      const usersAffected = Object.keys(userPointsMap).length;

      logger.info(`✓ Scoring complete: scored=${totalScoredCount}, users=${usersAffected}`);

      res.json({
        success: true,
        data: {
          scoredCount: totalScoredCount,
          usersAffected,
          pointsAggregated: Object.values(userPointsMap).reduce((a, b) => a + b, 0),
        },
      });
    } catch (error) {
      logger.error('❌ Cron scoring failed', error);
      res.status(500).json({ success: false, error: 'Scoring failed' });
    }
  },
};
