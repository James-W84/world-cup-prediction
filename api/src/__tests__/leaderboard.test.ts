import { describe, it, expect } from 'vitest';
import { prisma } from '../lib/prisma';
import { leagueController } from '../controllers/leagueController';
import { createUser, mockReq, mockRes } from './fixtures';

async function createLeagueWithMembers(members: { id: string }[]) {
  const creator = members[0];
  const league = await prisma.league.create({
    data: {
      name: 'Test League',
      inviteCode: `code-${Math.random().toString(36).slice(2)}`,
      createdBy: creator.id,
      members: { create: members.map((u) => ({ userId: u.id })) },
    },
  });
  return league;
}

async function getLeaderboard(userId: string, leagueId: string, page = '0') {
  const req = mockReq({ userId, params: { leagueId }, query: { page, limit: '50' } });
  const res = mockRes();
  await leagueController.getLeaderboard(req, res);
  return res;
}

describe('getLeaderboard', () => {
  it('returns 403 for non-members', async () => {
    const creator = await createUser();
    const outsider = await createUser();
    const league = await createLeagueWithMembers([creator]);

    const res = await getLeaderboard(outsider.id, league.id);

    expect(res._status).toBe(403);
  });

  it('ranks users by totalPoints descending', async () => {
    const u1 = await createUser({ totalPoints: 10 });
    const u2 = await createUser({ totalPoints: 5 });
    const u3 = await createUser({ totalPoints: 15 });
    const league = await createLeagueWithMembers([u1, u2, u3]);

    const res = await getLeaderboard(u1.id, league.id);

    expect(res._body.success).toBe(true);
    const lb = res._body.data.leaderboard;
    expect(lb[0].totalPoints).toBe(15);
    expect(lb[1].totalPoints).toBe(10);
    expect(lb[2].totalPoints).toBe(5);
  });

  it('assigns rank 1 to tied top users and correct rank to the next', async () => {
    const u1 = await createUser({ totalPoints: 10 });
    const u2 = await createUser({ totalPoints: 10 });
    const u3 = await createUser({ totalPoints: 5 });
    const league = await createLeagueWithMembers([u1, u2, u3]);

    const res = await getLeaderboard(u1.id, league.id);

    const lb = res._body.data.leaderboard;
    expect(lb[0].rank).toBe(1);
    expect(lb[1].rank).toBe(1);
    expect(lb[2].rank).toBe(3); // not 2
  });

  it('returns correct pagination metadata', async () => {
    const users = await Promise.all(Array.from({ length: 3 }, () => createUser()));
    const league = await createLeagueWithMembers(users);

    const res = await getLeaderboard(users[0].id, league.id);

    const pagination = res._body.data.pagination;
    expect(pagination.total).toBe(3);
    expect(pagination.hasMore).toBe(false);
    expect(pagination.page).toBe(0);
  });

  it('includes the requesting user in results', async () => {
    const u1 = await createUser({ totalPoints: 20 });
    const u2 = await createUser({ totalPoints: 10 });
    const league = await createLeagueWithMembers([u1, u2]);

    const res = await getLeaderboard(u2.id, league.id);

    const lb = res._body.data.leaderboard;
    const userIds = lb.map((e: { userId: string }) => e.userId);
    expect(userIds).toContain(u2.id);
  });
});
