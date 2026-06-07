import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthenticatedRequest } from '../types';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();

export const predictionController = {
  createOrUpdate: async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { matchId, predictedOutcome } = req.body;
      const userId = req.user?.userId;

      if (!userId || !matchId || !predictedOutcome) {
        res.status(400).json({ success: false, error: 'Missing required fields' });
        return;
      }

      // Fetch match to check kickoff time and status
      const match = await prisma.match.findUnique({ where: { id: matchId } });
      if (!match) {
        res.status(404).json({ success: false, error: 'Match not found' });
        return;
      }

      // Dual check: prediction lock (kickoffTime + status)
      const now = new Date();
      if (now > match.kickoffTime || match.status !== 'UPCOMING') {
        res.status(410).json({ success: false, error: 'Predictions locked for this match' });
        return;
      }

      // Validate: DRAW only allowed in GROUP stage
      if (predictedOutcome === 'DRAW' && match.stage !== 'GROUP') {
        res.status(400).json({ success: false, error: 'Draw predictions only allowed for group stage' });
        return;
      }

      // Upsert prediction (create or update)
      const prediction = await prisma.matchPrediction.upsert({
        where: {
          userId_matchId: { userId, matchId },
        },
        update: {
          predictedOutcome,
        },
        create: {
          userId,
          matchId,
          predictedOutcome,
        },
      });

      logger.info(`Prediction saved: user=${userId}, match=${matchId}, outcome=${predictedOutcome}`);

      res.json({
        success: true,
        data: prediction,
      });
    } catch (error) {
      logger.error('Error saving prediction', error);
      res.status(500).json({ success: false, error: 'Failed to save prediction' });
    }
  },

  getByMatch: async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { matchId } = req.query;
      const userId = req.user?.userId;

      if (!userId || !matchId) {
        res.status(400).json({ success: false, error: 'Missing required fields' });
        return;
      }

      const prediction = await prisma.matchPrediction.findUnique({
        where: {
          userId_matchId: { userId: userId as string, matchId: matchId as string },
        },
      });

      res.json({
        success: true,
        data: prediction || null,
      });
    } catch (error) {
      logger.error('Error fetching prediction', error);
      res.status(500).json({ success: false, error: 'Failed to fetch prediction' });
    }
  },

  submit: async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { predictionId } = req.params;
      const userId = req.user?.userId;

      if (!userId || !predictionId) {
        res.status(400).json({ success: false, error: 'Missing required fields' });
        return;
      }

      // Fetch prediction
      const prediction = await prisma.matchPrediction.findUnique({
        where: { id: predictionId },
        include: { match: true },
      });

      if (!prediction) {
        res.status(404).json({ success: false, error: 'Prediction not found' });
        return;
      }

      // Verify ownership
      if (prediction.userId !== userId) {
        res.status(403).json({ success: false, error: 'Unauthorized' });
        return;
      }

      // Dual check: prediction lock (kickoffTime + status)
      const now = new Date();
      if (now > prediction.match.kickoffTime || prediction.match.status !== 'UPCOMING') {
        res.status(410).json({ success: false, error: 'Predictions locked for this match' });
        return;
      }

      // Mark as submitted
      const updated = await prisma.matchPrediction.update({
        where: { id: predictionId },
        data: { isSubmitted: true },
      });

      logger.info(`Prediction submitted: user=${userId}, prediction=${predictionId}`);

      res.json({
        success: true,
        data: updated,
      });
    } catch (error) {
      logger.error('Error submitting prediction', error);
      res.status(500).json({ success: false, error: 'Failed to submit prediction' });
    }
  },
};
