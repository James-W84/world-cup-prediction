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

  getGroupStandings: async (_req: Request, res: Response): Promise<void> => {
    try {
      const matches = await prisma.match.findMany({
        where: { stage: 'GROUP' },
        select: { group: true, homeTeam: true, awayTeam: true, actualOutcome: true },
        orderBy: { kickoffTime: 'asc' },
      });

      type Row = { played: number; won: number; drawn: number; lost: number; points: number };
      const groups: Record<string, Record<string, Row>> = {};

      for (const m of matches) {
        const g = m.group ?? 'TBD';
        if (!groups[g]) groups[g] = {};
        for (const team of [m.homeTeam, m.awayTeam]) {
          if (!groups[g][team]) groups[g][team] = { played: 0, won: 0, drawn: 0, lost: 0, points: 0 };
        }

        if (m.actualOutcome) {
          groups[g][m.homeTeam].played++;
          groups[g][m.awayTeam].played++;

          if (m.actualOutcome === 'HOME_WIN') {
            groups[g][m.homeTeam].won++;    groups[g][m.homeTeam].points += 3;
            groups[g][m.awayTeam].lost++;
          } else if (m.actualOutcome === 'AWAY_WIN') {
            groups[g][m.awayTeam].won++;    groups[g][m.awayTeam].points += 3;
            groups[g][m.homeTeam].lost++;
          } else {
            groups[g][m.homeTeam].drawn++;  groups[g][m.homeTeam].points++;
            groups[g][m.awayTeam].drawn++;  groups[g][m.awayTeam].points++;
          }
        }
      }

      const standings = Object.fromEntries(
        Object.entries(groups)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([group, teams]) => [
            group,
            Object.entries(teams)
              .map(([team, row]) => ({ team, ...row }))
              .sort((a, b) => b.points - a.points || b.won - a.won),
          ])
      );

      res.json({ success: true, data: standings });
    } catch (error) {
      logger.error('Error computing group standings', error);
      res.status(500).json({ success: false, error: 'Failed to compute standings' });
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
