import { describe, it, expect } from 'vitest';
import { prisma } from '../lib/prisma';
import { predictionController } from '../controllers/predictionController';
import {
  createUser,
  setMatchStatus,
  setMatchKickoff,
  pastDate,
  futureDate,
  mockReq,
  mockRes,
} from './fixtures';

async function predict(userId: string, matchId: string, outcome: string) {
  const req = mockReq({ body: { matchId, predictedOutcome: outcome }, userId });
  const res = mockRes();
  await predictionController.createOrUpdate(req, res);
  return res;
}

describe('Group stage locking', () => {
  it('accepts prediction when kickoff is in the future and status is UPCOMING', async () => {
    const user = await createUser();
    const match = await prisma.match.findFirstOrThrow({ where: { stage: 'GROUP' } });

    const res = await predict(user.id, match.id, 'HOME_WIN');

    expect(res._body).toMatchObject({ success: true });
    expect(res._status).toBeUndefined();
  });

  it('blocks prediction when kickoff is in the past', async () => {
    const user = await createUser();
    const match = await prisma.match.findFirstOrThrow({ where: { stage: 'GROUP' } });
    await setMatchKickoff(match.id, pastDate(2));

    const res = await predict(user.id, match.id, 'HOME_WIN');

    expect(res._status).toBe(410);
    expect(res._body.error).toMatch(/locked/i);
  });

  it('blocks prediction when status is LIVE even if kickoff is in the future', async () => {
    const user = await createUser();
    const match = await prisma.match.findFirstOrThrow({ where: { stage: 'GROUP' } });
    await setMatchStatus(match.id, 'LIVE');

    const res = await predict(user.id, match.id, 'HOME_WIN');

    expect(res._status).toBe(410);
  });

  it('blocks prediction when status is COMPLETED', async () => {
    const user = await createUser();
    const match = await prisma.match.findFirstOrThrow({ where: { stage: 'GROUP' } });
    await setMatchStatus(match.id, 'COMPLETED');

    const res = await predict(user.id, match.id, 'HOME_WIN');

    expect(res._status).toBe(410);
  });

  it('accepts DRAW prediction on GROUP stage', async () => {
    const user = await createUser();
    const match = await prisma.match.findFirstOrThrow({ where: { stage: 'GROUP' } });

    const res = await predict(user.id, match.id, 'DRAW');

    expect(res._body).toMatchObject({ success: true });
  });

  it('rejects DRAW prediction on LAST_32 stage', async () => {
    const user = await createUser();
    const match = await prisma.match.findFirstOrThrow({ where: { stage: 'LAST_32' } });
    await setMatchKickoff(match.id, futureDate(48));

    const res = await predict(user.id, match.id, 'DRAW');

    expect(res._status).toBe(400);
    expect(res._body.error).toMatch(/draw/i);
  });
});

describe('Knockout bracket locking', () => {
  it('accepts all knockout predictions when first R32 kickoff is in the future', async () => {
    const user = await createUser();
    const stages = ['LAST_32', 'ROUND_OF_16', 'QF', 'SF', 'FINAL'] as const;

    for (const stage of stages) {
      const match = await prisma.match.findFirstOrThrow({ where: { stage } });
      const res = await predict(user.id, match.id, 'HOME_WIN');
      expect(res._body).toMatchObject({ success: true });
    }
  });

  it('locks ALL knockout stages when first R32 kickoff is in the past', async () => {
    const user = await createUser();

    const firstR32 = await prisma.match.findFirstOrThrow({
      where: { stage: 'LAST_32' },
      orderBy: { kickoffTime: 'asc' },
    });
    await setMatchKickoff(firstR32.id, pastDate(1));

    const stages = ['LAST_32', 'ROUND_OF_16', 'QF', 'SF', 'FINAL'] as const;
    for (const stage of stages) {
      const match = await prisma.match.findFirstOrThrow({ where: { stage } });
      const res = await predict(user.id, match.id, 'HOME_WIN');
      expect(res._status).toBe(410);
    }
  });

  it('locks ALL knockout stages when first R32 is LIVE (even if kickoff is future)', async () => {
    const user = await createUser();

    const firstR32 = await prisma.match.findFirstOrThrow({
      where: { stage: 'LAST_32' },
      orderBy: { kickoffTime: 'asc' },
    });
    await setMatchStatus(firstR32.id, 'LIVE');

    const r16Match = await prisma.match.findFirstOrThrow({ where: { stage: 'ROUND_OF_16' } });
    const res = await predict(user.id, r16Match.id, 'HOME_WIN');
    expect(res._status).toBe(410);
  });

  it('group matches remain editable even when knockout is locked', async () => {
    const user = await createUser();

    const firstR32 = await prisma.match.findFirstOrThrow({
      where: { stage: 'LAST_32' },
      orderBy: { kickoffTime: 'asc' },
    });
    await setMatchKickoff(firstR32.id, pastDate(1));

    const groupMatch = await prisma.match.findFirstOrThrow({ where: { stage: 'GROUP' } });
    const res = await predict(user.id, groupMatch.id, 'HOME_WIN');
    expect(res._body).toMatchObject({ success: true });
  });
});
