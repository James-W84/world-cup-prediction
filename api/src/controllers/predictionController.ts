import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';

const KNOCKOUT_STAGES = new Set(['LAST_32', 'ROUND_OF_16', 'QF', 'SF', 'FINAL']);

async function isKnockoutLocked(): Promise<boolean> {
  const first = await prisma.match.findFirst({
    where: { stage: 'LAST_32' },
    orderBy: { kickoffTime: 'asc' },
  });
  if (!first) return false;
  return new Date() > first.kickoffTime || first.status !== 'UPCOMING';
}

export const predictionController = {
  createOrUpdate: async (req: Request, res: Response): Promise<void> => {
    try {
      const { matchId, predictedOutcome, isSubmitted: submitNow = false } = req.body;
      const userId = req.user?.id;

      if (!userId || !matchId || !predictedOutcome) {
        res.status(400).json({ success: false, error: 'Missing required fields' });
        return;
      }

      const match = await prisma.match.findUnique({ where: { id: matchId } });
      if (!match) {
        res.status(404).json({ success: false, error: 'Match not found' });
        return;
      }

      const now = new Date();

      if (KNOCKOUT_STAGES.has(match.stage)) {
        if (await isKnockoutLocked()) {
          res.status(410).json({ success: false, error: 'Knockout bracket is locked' });
          return;
        }
      } else if (now > match.kickoffTime || match.status !== 'UPCOMING') {
        res.status(410).json({ success: false, error: 'Predictions locked for this match' });
        return;
      }

      if (predictedOutcome === 'DRAW' && match.stage !== 'GROUP') {
        res.status(400).json({ success: false, error: 'Draw predictions only allowed for group stage' });
        return;
      }

      const prediction = await prisma.matchPrediction.upsert({
        where: { userId_matchId: { userId, matchId } },
        update: { predictedOutcome, isSubmitted: Boolean(submitNow) },
        create: { userId, matchId, predictedOutcome, isSubmitted: Boolean(submitNow) },
      });

      logger.info(`Prediction saved: user=${userId}, match=${matchId}, outcome=${predictedOutcome}`);
      res.json({ success: true, data: prediction });
    } catch (error) {
      logger.error('Error saving prediction', error);
      res.status(500).json({ success: false, error: 'Failed to save prediction' });
    }
  },

  getByMatch: async (req: Request, res: Response): Promise<void> => {
    try {
      const { matchId } = req.query;
      const userId = req.user?.id;

      if (!userId || !matchId) {
        res.status(400).json({ success: false, error: 'Missing required fields' });
        return;
      }

      const prediction = await prisma.matchPrediction.findUnique({
        where: { userId_matchId: { userId, matchId: matchId as string } },
      });

      res.json({ success: true, data: prediction || null });
    } catch (error) {
      logger.error('Error fetching prediction', error);
      res.status(500).json({ success: false, error: 'Failed to fetch prediction' });
    }
  },

  submit: async (req: Request, res: Response): Promise<void> => {
    try {
      const { predictionId } = req.params;
      const userId = req.user?.id;

      if (!userId || !predictionId) {
        res.status(400).json({ success: false, error: 'Missing required fields' });
        return;
      }

      const prediction = await prisma.matchPrediction.findUnique({
        where: { id: predictionId },
        include: { match: true },
      });

      if (!prediction) {
        res.status(404).json({ success: false, error: 'Prediction not found' });
        return;
      }

      if (prediction.userId !== userId) {
        res.status(403).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const now = new Date();
      const matchStage = prediction.match.stage;

      if (KNOCKOUT_STAGES.has(matchStage)) {
        if (await isKnockoutLocked()) {
          res.status(410).json({ success: false, error: 'Knockout bracket is locked' });
          return;
        }
      } else if (now > prediction.match.kickoffTime || prediction.match.status !== 'UPCOMING') {
        res.status(410).json({ success: false, error: 'Predictions locked for this match' });
        return;
      }

      const updated = await prisma.matchPrediction.update({
        where: { id: predictionId },
        data: { isSubmitted: true },
      });

      logger.info(`Prediction submitted: user=${userId}, prediction=${predictionId}`);
      res.json({ success: true, data: updated });
    } catch (error) {
      logger.error('Error submitting prediction', error);
      res.status(500).json({ success: false, error: 'Failed to submit prediction' });
    }
  },
};
