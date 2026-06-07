import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';
import { generateInviteCode } from '../utils/helpers';

export const leagueController = {
  create: async (req: Request, res: Response): Promise<void> => {
    try {
      const { name } = req.body;
      const userId = req.user?.id;

      if (!userId || !name) {
        res.status(400).json({ success: false, error: 'Missing required fields' });
        return;
      }

      let inviteCode = generateInviteCode();
      while (await prisma.league.findUnique({ where: { inviteCode } })) {
        inviteCode = generateInviteCode();
      }

      const league = await prisma.league.create({
        data: {
          name,
          inviteCode,
          members: { create: { userId } },
        },
        include: { members: true },
      });

      logger.info(`League created: ${league.id}, creator=${userId}`);
      res.status(201).json({ success: true, data: league });
    } catch (error) {
      logger.error('Error creating league', error);
      res.status(500).json({ success: false, error: 'Failed to create league' });
    }
  },

  getLeaderboard: async (req: Request, res: Response): Promise<void> => {
    try {
      const { leagueId } = req.params;
      const { page = '0', limit = '50' } = req.query;
      const userId = req.user?.id;

      if (!userId || !leagueId) {
        res.status(400).json({ success: false, error: 'Missing required fields' });
        return;
      }

      const membership = await prisma.leagueMember.findUnique({
        where: { userId_leagueId: { userId, leagueId } },
      });

      if (!membership) {
        res.status(403).json({ success: false, error: 'Not a league member' });
        return;
      }

      const pageNum = parseInt(page as string, 10) || 0;
      const limitNum = Math.min(parseInt(limit as string, 10) || 50, 50);

      const leaderboard = await prisma.leagueMember.findMany({
        where: { leagueId },
        include: {
          user: { select: { id: true, username: true, totalPoints: true, avatarUrl: true } },
        },
        orderBy: [{ user: { totalPoints: 'desc' } }, { user: { id: 'asc' } }],
        skip: pageNum * limitNum,
        take: limitNum,
      });

      // Dense rank with tie handling
      const skip = pageNum * limitNum;
      let rank = skip + 1;
      const ranked = leaderboard.map((member: typeof leaderboard[0], index: number) => {
        if (index > 0 && member.user.totalPoints < leaderboard[index - 1].user.totalPoints) {
          rank = skip + index + 1;
        }
        return {
          rank,
          userId: member.user.id,
          username: member.user.username,
          avatarUrl: member.user.avatarUrl,
          totalPoints: member.user.totalPoints,
        };
      });

      const totalMembers = await prisma.leagueMember.count({ where: { leagueId } });

      res.json({
        success: true,
        data: {
          leaderboard: ranked,
          pagination: {
            page: pageNum,
            limit: limitNum,
            total: totalMembers,
            hasMore: (pageNum + 1) * limitNum < totalMembers,
          },
        },
      });
    } catch (error) {
      logger.error('Error fetching leaderboard', error);
      res.status(500).json({ success: false, error: 'Failed to fetch leaderboard' });
    }
  },

  join: async (req: Request, res: Response): Promise<void> => {
    try {
      const { inviteCode } = req.body;
      const userId = req.user?.id;

      if (!userId || !inviteCode) {
        res.status(400).json({ success: false, error: 'Missing required fields' });
        return;
      }

      const league = await prisma.league.findUnique({ where: { inviteCode } });
      if (!league) {
        res.status(404).json({ success: false, error: 'League not found' });
        return;
      }

      const existingMember = await prisma.leagueMember.findUnique({
        where: { userId_leagueId: { userId, leagueId: league.id } },
      });

      if (existingMember) {
        res.status(409).json({ success: false, error: 'Already a member of this league' });
        return;
      }

      await prisma.leagueMember.create({ data: { userId, leagueId: league.id } });

      logger.info(`User joined league: user=${userId}, league=${league.id}`);
      res.json({ success: true, data: league });
    } catch (error) {
      logger.error('Error joining league', error);
      res.status(500).json({ success: false, error: 'Failed to join league' });
    }
  },

  getDetails: async (req: Request, res: Response): Promise<void> => {
    try {
      const { leagueId } = req.params;
      const userId = req.user?.id;

      if (!userId || !leagueId) {
        res.status(400).json({ success: false, error: 'Missing required fields' });
        return;
      }

      const membership = await prisma.leagueMember.findUnique({
        where: { userId_leagueId: { userId, leagueId } },
      });

      if (!membership) {
        res.status(403).json({ success: false, error: 'Not a league member' });
        return;
      }

      const league = await prisma.league.findUnique({
        where: { id: leagueId },
        include: {
          members: {
            include: {
              user: { select: { id: true, username: true, totalPoints: true, avatarUrl: true } },
            },
            orderBy: { user: { totalPoints: 'desc' } },
          },
          _count: { select: { members: true } },
        },
      });

      res.json({ success: true, data: league });
    } catch (error) {
      logger.error('Error fetching league details', error);
      res.status(500).json({ success: false, error: 'Failed to fetch league details' });
    }
  },
};
