import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthenticatedRequest } from '../types';
import { logger } from '../utils/logger';
import { generateInviteCode } from '../utils/helpers';

const prisma = new PrismaClient();

export const leagueController = {
  create: async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { name } = req.body;
      const userId = req.user?.userId;

      if (!userId || !name) {
        res.status(400).json({ success: false, error: 'Missing required fields' });
        return;
      }

      // Generate unique invite code
      let inviteCode = generateInviteCode();
      let existingLeague = await prisma.league.findUnique({ where: { inviteCode } });
      
      while (existingLeague) {
        inviteCode = generateInviteCode();
        existingLeague = await prisma.league.findUnique({ where: { inviteCode } });
      }

      // Create league and auto-add creator as member
      const league = await prisma.league.create({
        data: {
          name,
          inviteCode,
          members: {
            create: {
              userId,
            },
          },
        },
        include: { members: true },
      });

      logger.info(`League created: ${league.id}, creator=${userId}`);

      res.status(201).json({
        success: true,
        data: league,
      });
    } catch (error) {
      logger.error('Error creating league', error);
      res.status(500).json({ success: false, error: 'Failed to create league' });
    }
  },

  getLeaderboard: async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { leagueId } = req.params;
      const { page = '0', limit = '50' } = req.query;
      const userId = req.user?.userId;

      if (!userId || !leagueId) {
        res.status(400).json({ success: false, error: 'Missing required fields' });
        return;
      }

      // Verify user is league member
      const membership = await prisma.leagueMember.findUnique({
        where: {
          userId_leagueId: { userId, leagueId: leagueId as string },
        },
      });

      if (!membership) {
        res.status(403).json({ success: false, error: 'Not a league member' });
        return;
      }

      const pageNum = parseInt(page as string, 10) || 0;
      const limitNum = parseInt(limit as string, 10) || 50;

      // Fetch leaderboard: all league members sorted by points DESC, then by id ASC
      const leaderboard = await prisma.leagueMember.findMany({
        where: { leagueId: leagueId as string },
        include: {
          user: {
            select: { id: true, username: true, totalPoints: true },
          },
        },
        orderBy: [
          { user: { totalPoints: 'desc' } },
          { user: { id: 'asc' } },
        ],
        skip: pageNum * limitNum,
        take: limitNum,
      });

      // Add rank to each entry
      const skip = pageNum * limitNum;
      const ranked = leaderboard.map((member: any, index: number) => ({
        rank: skip + index + 1,
        username: member.user.username,
        totalPoints: member.user.totalPoints,
        userId: member.user.id,
      }));

      // Get total count for pagination
      const totalMembers = await prisma.leagueMember.count({
        where: { leagueId: leagueId as string },
      });

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

  join: async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { inviteCode } = req.body;
      const userId = req.user?.userId;

      if (!userId || !inviteCode) {
        res.status(400).json({ success: false, error: 'Missing required fields' });
        return;
      }

      // Find league by invite code
      const league = await prisma.league.findUnique({ where: { inviteCode } });

      if (!league) {
        res.status(404).json({ success: false, error: 'League not found' });
        return;
      }

      // Check if already a member
      const existingMember = await prisma.leagueMember.findUnique({
        where: {
          userId_leagueId: { userId, leagueId: league.id },
        },
      });

      if (existingMember) {
        res.status(409).json({ success: false, error: 'Already a member of this league' });
        return;
      }

      // Add user as league member
      await prisma.leagueMember.create({
        data: {
          userId,
          leagueId: league.id,
        },
      });

      logger.info(`User joined league: user=${userId}, league=${league.id}`);

      res.json({
        success: true,
        data: league,
      });
    } catch (error) {
      logger.error('Error joining league', error);
      res.status(500).json({ success: false, error: 'Failed to join league' });
    }
  },

  getDetails: async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { leagueId } = req.params;
      const userId = req.user?.userId;

      if (!userId || !leagueId) {
        res.status(400).json({ success: false, error: 'Missing required fields' });
        return;
      }

      // Verify user is league member
      const membership = await prisma.leagueMember.findUnique({
        where: {
          userId_leagueId: { userId, leagueId: leagueId as string },
        },
      });

      if (!membership) {
        res.status(403).json({ success: false, error: 'Not a league member' });
        return;
      }

      // Fetch league with members
      const league = await prisma.league.findUnique({
        where: { id: leagueId as string },
        include: {
          members: {
            include: {
              user: {
                select: { id: true, username: true, totalPoints: true },
              },
            },
          },
        },
      });

      res.json({
        success: true,
        data: league,
      });
    } catch (error) {
      logger.error('Error fetching league details', error);
      res.status(500).json({ success: false, error: 'Failed to fetch league details' });
    }
  },
};
