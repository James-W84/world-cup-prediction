import { beforeEach, afterAll } from 'vitest';
import { prisma } from '../lib/prisma';

const FAR_FUTURE = new Date('2030-01-01T00:00:00Z');

beforeEach(async () => {
  await prisma.matchPrediction.deleteMany();
  await prisma.groupTableScore.deleteMany();
  await prisma.leagueJoinRequest.deleteMany();
  await prisma.leagueMember.deleteMany();
  await prisma.league.deleteMany();
  await prisma.user.deleteMany();
  await prisma.match.updateMany({
    data: { status: 'UPCOMING' as any, actualOutcome: null, kickoffTime: FAR_FUTURE },
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
