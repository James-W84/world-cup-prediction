import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';
import { generateInviteCode } from '../utils/helpers';

export const leagueController = {
  getMyLeagues: async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) { res.status(401).json({ success: false, error: 'Not authenticated' }); return; }

      const memberships = await prisma.leagueMember.findMany({
        where: { userId },
        include: {
          league: {
            include: { _count: { select: { members: true } } },
          },
        },
        orderBy: { joinedAt: 'desc' },
      });

      // Also include leagues where user has a pending request
      const pendingRequests = await prisma.leagueJoinRequest.findMany({
        where: { userId, status: 'PENDING' },
        include: {
          league: { include: { _count: { select: { members: true } } } },
        },
      });

      // For leagues the user created, fetch pending request counts in one query
      const adminLeagueIds = memberships
        .filter((m) => m.league.createdBy === userId)
        .map((m) => m.league.id);

      const pendingCounts = adminLeagueIds.length
        ? await prisma.leagueJoinRequest.groupBy({
            by: ['leagueId'],
            where: { leagueId: { in: adminLeagueIds }, status: 'PENDING' },
            _count: { id: true },
          })
        : [];

      const pendingCountMap = Object.fromEntries(
        pendingCounts.map((r) => [r.leagueId, r._count.id]),
      );

      const leagueList = [
        ...memberships.map((m) => ({
          ...m.league,
          joinStatus: 'member' as const,
          isAdmin: m.league.createdBy === userId,
          pendingRequestCount: pendingCountMap[m.league.id] ?? 0,
        })),
        ...pendingRequests.map((r) => ({ ...r.league, joinStatus: 'pending' as const })),
      ];

      res.json({ success: true, data: leagueList });
    } catch (error) {
      logger.error('Error fetching leagues', error);
      res.status(500).json({ success: false, error: 'Failed to fetch leagues' });
    }
  },

  create: async (req: Request, res: Response): Promise<void> => {
    try {
      const { name } = req.body;
      const userId = req.user?.id;

      if (!userId || !name) { res.status(400).json({ success: false, error: 'Missing required fields' }); return; }

      let inviteCode = generateInviteCode();
      while (await prisma.league.findUnique({ where: { inviteCode } })) {
        inviteCode = generateInviteCode();
      }

      const league = await prisma.league.create({
        data: {
          name,
          inviteCode,
          createdBy: userId,
          members: { create: { userId } },
        },
        include: { members: true },
      });

      logger.info(`League created: ${league.id}, creator=${userId}`);
      res.status(201).json({ success: true, data: { ...league, joinStatus: 'member', isAdmin: true } });
    } catch (error) {
      logger.error('Error creating league', error);
      res.status(500).json({ success: false, error: 'Failed to create league' });
    }
  },

  join: async (req: Request, res: Response): Promise<void> => {
    try {
      const { inviteCode } = req.body;
      const userId = req.user?.id;

      if (!userId || !inviteCode) { res.status(400).json({ success: false, error: 'Missing required fields' }); return; }

      const league = await prisma.league.findUnique({ where: { inviteCode } });
      if (!league) { res.status(404).json({ success: false, error: 'League not found' }); return; }

      const existingMember = await prisma.leagueMember.findUnique({
        where: { userId_leagueId: { userId, leagueId: league.id } },
      });
      if (existingMember) { res.status(409).json({ success: false, error: 'Already a member of this league' }); return; }

      // If user is the creator, skip the request flow
      if (league.createdBy === userId) {
        res.status(409).json({ success: false, error: 'Already a member of this league' });
        return;
      }

      // Upsert join request (handle re-submit after denial)
      const existing = await prisma.leagueJoinRequest.findUnique({
        where: { userId_leagueId: { userId, leagueId: league.id } },
      });

      if (existing) {
        if (existing.status === 'PENDING') {
          res.status(409).json({ success: false, error: 'Join request already pending' });
          return;
        }
        if (existing.status === 'APPROVED') {
          res.status(409).json({ success: false, error: 'Already a member of this league' });
          return;
        }
        // Re-submit a denied request
        await prisma.leagueJoinRequest.update({
          where: { id: existing.id },
          data: { status: 'PENDING' },
        });
      } else {
        await prisma.leagueJoinRequest.create({ data: { userId, leagueId: league.id } });
      }

      logger.info(`Join request created: user=${userId}, league=${league.id}`);
      res.json({ success: true, data: { league, joinStatus: 'pending' } });
    } catch (error) {
      logger.error('Error requesting to join league', error);
      res.status(500).json({ success: false, error: 'Failed to request league join' });
    }
  },

  getJoinRequests: async (req: Request, res: Response): Promise<void> => {
    try {
      const { leagueId } = req.params;
      const userId = req.user?.id;
      if (!userId) { res.status(401).json({ success: false, error: 'Not authenticated' }); return; }

      const league = await prisma.league.findUnique({ where: { id: leagueId } });
      if (!league) { res.status(404).json({ success: false, error: 'League not found' }); return; }
      if (league.createdBy !== userId) { res.status(403).json({ success: false, error: 'Admin only' }); return; }

      const requests = await prisma.leagueJoinRequest.findMany({
        where: { leagueId, status: 'PENDING' },
        include: { user: { select: { id: true, username: true, avatarUrl: true } } },
        orderBy: { createdAt: 'asc' },
      });

      res.json({ success: true, data: requests });
    } catch (error) {
      logger.error('Error fetching join requests', error);
      res.status(500).json({ success: false, error: 'Failed to fetch join requests' });
    }
  },

  approveRequest: async (req: Request, res: Response): Promise<void> => {
    try {
      const { leagueId, requestId } = req.params;
      const userId = req.user?.id;
      if (!userId) { res.status(401).json({ success: false, error: 'Not authenticated' }); return; }

      const league = await prisma.league.findUnique({ where: { id: leagueId } });
      if (!league) { res.status(404).json({ success: false, error: 'League not found' }); return; }
      if (league.createdBy !== userId) { res.status(403).json({ success: false, error: 'Admin only' }); return; }

      const joinReq = await prisma.leagueJoinRequest.findUnique({
        where: { id: requestId },
      });
      if (!joinReq || joinReq.leagueId !== leagueId) { res.status(404).json({ success: false, error: 'Request not found' }); return; }
      if (joinReq.status !== 'PENDING') { res.status(409).json({ success: false, error: 'Request already processed' }); return; }

      await prisma.$transaction([
        prisma.leagueJoinRequest.update({ where: { id: requestId }, data: { status: 'APPROVED' } }),
        prisma.leagueMember.create({ data: { userId: joinReq.userId, leagueId } }),
      ]);

      logger.info(`Join request approved: request=${requestId}, league=${leagueId}`);
      res.json({ success: true, data: { message: 'Approved' } });
    } catch (error) {
      logger.error('Error approving join request', error);
      res.status(500).json({ success: false, error: 'Failed to approve request' });
    }
  },

  denyRequest: async (req: Request, res: Response): Promise<void> => {
    try {
      const { leagueId, requestId } = req.params;
      const userId = req.user?.id;
      if (!userId) { res.status(401).json({ success: false, error: 'Not authenticated' }); return; }

      const league = await prisma.league.findUnique({ where: { id: leagueId } });
      if (!league) { res.status(404).json({ success: false, error: 'League not found' }); return; }
      if (league.createdBy !== userId) { res.status(403).json({ success: false, error: 'Admin only' }); return; }

      const joinReq = await prisma.leagueJoinRequest.findUnique({ where: { id: requestId } });
      if (!joinReq || joinReq.leagueId !== leagueId) { res.status(404).json({ success: false, error: 'Request not found' }); return; }
      if (joinReq.status !== 'PENDING') { res.status(409).json({ success: false, error: 'Request already processed' }); return; }

      await prisma.leagueJoinRequest.update({ where: { id: requestId }, data: { status: 'DENIED' } });

      logger.info(`Join request denied: request=${requestId}, league=${leagueId}`);
      res.json({ success: true, data: { message: 'Denied' } });
    } catch (error) {
      logger.error('Error denying join request', error);
      res.status(500).json({ success: false, error: 'Failed to deny request' });
    }
  },

  deleteLeague: async (req: Request, res: Response): Promise<void> => {
    try {
      const { leagueId } = req.params;
      const userId = req.user?.id;
      if (!userId) { res.status(401).json({ success: false, error: 'Not authenticated' }); return; }

      const league = await prisma.league.findUnique({ where: { id: leagueId } });
      if (!league) { res.status(404).json({ success: false, error: 'League not found' }); return; }
      if (league.createdBy !== userId) { res.status(403).json({ success: false, error: 'Admin only' }); return; }

      await prisma.league.delete({ where: { id: leagueId } });

      logger.info(`League deleted: ${leagueId}, by=${userId}`);
      res.json({ success: true, data: { message: 'Deleted' } });
    } catch (error) {
      logger.error('Error deleting league', error);
      res.status(500).json({ success: false, error: 'Failed to delete league' });
    }
  },

  removeMember: async (req: Request, res: Response): Promise<void> => {
    try {
      const { leagueId, memberId } = req.params;
      const userId = req.user?.id;
      if (!userId) { res.status(401).json({ success: false, error: 'Not authenticated' }); return; }

      const league = await prisma.league.findUnique({ where: { id: leagueId } });
      if (!league) { res.status(404).json({ success: false, error: 'League not found' }); return; }
      if (league.createdBy !== userId) { res.status(403).json({ success: false, error: 'Admin only' }); return; }
      if (memberId === userId) { res.status(400).json({ success: false, error: 'Cannot remove yourself' }); return; }

      await prisma.leagueMember.delete({
        where: { userId_leagueId: { userId: memberId, leagueId } },
      });

      logger.info(`Member removed: user=${memberId}, league=${leagueId}, by=${userId}`);
      res.json({ success: true, data: { message: 'Removed' } });
    } catch (error) {
      logger.error('Error removing member', error);
      res.status(500).json({ success: false, error: 'Failed to remove member' });
    }
  },

  getLeaderboard: async (req: Request, res: Response): Promise<void> => {
    try {
      const { leagueId } = req.params;
      const { page = '0', limit = '50' } = req.query;
      const userId = req.user?.id;

      if (!userId || !leagueId) { res.status(400).json({ success: false, error: 'Missing required fields' }); return; }

      const membership = await prisma.leagueMember.findUnique({
        where: { userId_leagueId: { userId, leagueId } },
      });
      if (!membership) { res.status(403).json({ success: false, error: 'Not a league member' }); return; }

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

  getDetails: async (req: Request, res: Response): Promise<void> => {
    try {
      const { leagueId } = req.params;
      const userId = req.user?.id;

      if (!userId || !leagueId) { res.status(400).json({ success: false, error: 'Missing required fields' }); return; }

      // Allow pending request holders to at least see their request status
      const membership = await prisma.leagueMember.findUnique({
        where: { userId_leagueId: { userId, leagueId } },
      });
      const joinRequest = !membership
        ? await prisma.leagueJoinRequest.findUnique({
            where: { userId_leagueId: { userId, leagueId } },
          })
        : null;

      if (!membership && !joinRequest) {
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

      const pendingCount = league?.createdBy === userId
        ? await prisma.leagueJoinRequest.count({ where: { leagueId, status: 'PENDING' } })
        : 0;

      res.json({
        success: true,
        data: {
          ...league,
          isAdmin: league?.createdBy === userId,
          pendingRequestCount: pendingCount,
          joinStatus: membership ? 'member' : joinRequest?.status?.toLowerCase(),
        },
      });
    } catch (error) {
      logger.error('Error fetching league details', error);
      res.status(500).json({ success: false, error: 'Failed to fetch league details' });
    }
  },
};
