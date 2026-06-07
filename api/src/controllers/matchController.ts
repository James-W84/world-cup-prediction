import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';

export const matchController = {
  getByStage: async (req: Request, res: Response): Promise<void> => {
    try {
      const { stage } = req.query;
      const userId = req.user?.id;

      if (!stage) {
        res.status(400).json({ success: false, error: 'Stage parameter required' });
        return;
      }

      const [matches, firstKnockout] = await Promise.all([
        prisma.match.findMany({
          where: { stage: stage as any },
          include: userId ? {
            predictions: {
              where: { userId },
              select: {
                id: true,
                matchId: true,
                predictedOutcome: true,
                isSubmitted: true,
                isScored: true,
                pointsAwarded: true,
                updatedAt: true,
              },
            },
          } : undefined,
          orderBy: { kickoffTime: 'asc' },
        }),
        prisma.match.findFirst({
          where: { stage: 'LAST_32' },
          orderBy: { kickoffTime: 'asc' },
          select: { kickoffTime: true, status: true },
        }),
      ]);

      const knockoutLocked = firstKnockout != null &&
        (new Date() > firstKnockout.kickoffTime || firstKnockout.status !== 'UPCOMING');

      res.json({ success: true, data: matches, knockoutLocked });
    } catch (error) {
      logger.error('Error fetching matches by stage', error);
      res.status(500).json({ success: false, error: 'Failed to fetch matches' });
    }
  },

  getById: async (req: Request, res: Response): Promise<void> => {
    try {
      const { matchId } = req.params;
      if (!matchId) {
        res.status(400).json({ success: false, error: 'Match ID required' });
        return;
      }

      const match = await prisma.match.findUnique({ where: { id: matchId } });
      if (!match) {
        res.status(404).json({ success: false, error: 'Match not found' });
        return;
      }

      res.json({ success: true, data: match });
    } catch (error) {
      logger.error('Error fetching match', error);
      res.status(500).json({ success: false, error: 'Failed to fetch match' });
    }
  },

  getAllPredictions: async (req: Request, res: Response): Promise<void> => {
    try {
      const { matchId } = req.params;
      const userId = req.user?.id;

      if (!userId || !matchId) {
        res.status(400).json({ success: false, error: 'Missing required fields' });
        return;
      }

      const [match, prediction] = await Promise.all([
        prisma.match.findUnique({ where: { id: matchId } }),
        prisma.matchPrediction.findUnique({
          where: { userId_matchId: { userId, matchId } },
        }),
      ]);

      if (!match) {
        res.status(404).json({ success: false, error: 'Match not found' });
        return;
      }

      res.json({ success: true, data: { match, userPrediction: prediction } });
    } catch (error) {
      logger.error('Error fetching match predictions', error);
      res.status(500).json({ success: false, error: 'Failed to fetch predictions' });
    }
  },
};
