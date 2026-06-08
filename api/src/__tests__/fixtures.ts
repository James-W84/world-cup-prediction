import { prisma } from '../lib/prisma';

export async function createUser(opts: { username?: string; email?: string; totalPoints?: number } = {}) {
  const rand = Math.random().toString(36).slice(2, 8);
  return prisma.user.create({
    data: {
      email: opts.email ?? `user-${rand}@test.com`,
      username: opts.username ?? `user-${rand}`,
      totalPoints: opts.totalPoints ?? 0,
    },
  });
}

export async function createPrediction(userId: string, matchId: string, outcome: string) {
  return prisma.matchPrediction.create({
    data: { userId, matchId, predictedOutcome: outcome as any, isSubmitted: true },
  });
}

export async function setMatchCompleted(matchId: string, outcome: string) {
  return prisma.match.update({
    where: { id: matchId },
    data: { status: 'COMPLETED' as any, actualOutcome: outcome as any },
  });
}

export async function setMatchStatus(matchId: string, status: string) {
  return prisma.match.update({
    where: { id: matchId },
    data: { status: status as any },
  });
}

export async function setMatchKickoff(matchId: string, kickoffTime: Date) {
  return prisma.match.update({
    where: { id: matchId },
    data: { kickoffTime },
  });
}

export function pastDate(hoursAgo = 1) {
  return new Date(Date.now() - hoursAgo * 60 * 60 * 1000);
}

export function futureDate(hoursFromNow = 24) {
  return new Date(Date.now() + hoursFromNow * 60 * 60 * 1000);
}

export function mockRes() {
  const res: any = {};
  res.status = (code: number) => { res._status = code; return res; };
  res.json = (body: any) => { res._body = body; return res; };
  return res;
}

export function mockReq(opts: { body?: any; userId?: string; params?: any; query?: any } = {}) {
  return {
    body: opts.body ?? {},
    user: opts.userId ? { id: opts.userId } : undefined,
    params: opts.params ?? {},
    query: opts.query ?? {},
  } as any;
}
