import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthenticatedRequest } from '../types';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();

export const matchController = {
  getByStage: async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { stage } = req.query;
      const userId = req.user?.userId;

      if (!stage) {
        res.status(400).json({ success: false, error: 'Stage parameter required' });
        return;
      }

      // Fetch all matches for given stage
      const matches = await prisma.match.findMany({
        where: { stage: stage as any },
        include: userId ? {
          predictions: {
            where: { userId },
            select: {
              id: true,
              predictedOutcome: true,
              isSubmitted: true,
              isScored: true,
              pointsAwarded: true,
            },
          },
        } : false,
        orderBy: { kickoffTime: 'asc' },
      });

      res.json({
        success: true,
        data: matches,
      });
    } catch (error) {
      logger.error('Error fetching matches by stage', error);
      res.status(500).json({ success: false, error: 'Failed to fetch matches' });
    }
  },

  getById: async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { matchId } = req.params;

      if (!matchId) {
        res.status(400).json({ success: false, error: 'Match ID required' });
        return;
      }

      const match = await prisma.match.findUnique({
        where: { id: matchId },
      });

      if (!match) {
        res.status(404).json({ success: false, error: 'Match not found' });
        return;
      }

      res.json({
        success: true,
        data: match,
      });
    } catch (error) {
      logger.error('Error fetching match', error);
      res.status(500).json({ success: false, error: 'Failed to fetch match' });
    }
  },

  getAllPredictions: async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { matchId } = req.params;
      const userId = req.user?.userId;

      if (!userId || !matchId) {
        res.status(400).json({ success: false, error: 'Missing required fields' });
        return;
      }

      // Fetch user's prediction for this match
      const prediction = await prisma.matchPrediction.findUnique({
        where: {
          userId_matchId: { userId, matchId: matchId as string },
        },
      });

      // Fetch match details
      const match = await prisma.match.findUnique({
        where: { id: matchId as string },
      });

      if (!match) {
        res.status(404).json({ success: false, error: 'Match not found' });
        return;
      }

      res.json({
        success: true,
        data: {
          match,
          userPrediction: prediction,
        },
      });
    } catch (error) {
      logger.error('Error fetching match predictions', error);
      res.status(500).json({ success: false, error: 'Failed to fetch predictions' });
    }
  },
};
