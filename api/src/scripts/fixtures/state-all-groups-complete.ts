#!/usr/bin/env tsx
// Seeds all 12 groups (72 matches) as COMPLETED. Triggers group bonus eligibility.
// Run: DATABASE_URL=file:./prisma/dev.db npx tsx src/scripts/fixtures/state-all-groups-complete.ts
import 'dotenv/config';
import { prisma } from '../../lib/prisma';

const url = process.env.DATABASE_URL ?? '';
if (!url.startsWith('file:')) {
  console.error('SAFETY: This script only runs against a local SQLite database (file: URL).');
  process.exit(1);
}

const OUTCOMES = ['HOME_WIN', 'AWAY_WIN', 'DRAW'] as const;

async function run() {
  console.log('Seeding all group stage matches as COMPLETED...');

  const matches = await prisma.match.findMany({ where: { stage: 'GROUP' } });

  if (matches.length < 72) {
    console.error(`Expected 72 group matches, found ${matches.length}. Run seed first.`);
    process.exit(1);
  }

  const user = await prisma.user.upsert({
    where: { email: 'fixture@test.com' },
    update: {},
    create: { email: 'fixture@test.com', username: 'fixture-user', totalPoints: 0 },
  });

  for (let i = 0; i < matches.length; i++) {
    const actualOutcome = OUTCOMES[i % 3];
    await prisma.match.update({
      where: { id: matches[i].id },
      data: {
        status: 'COMPLETED',
        actualOutcome,
        kickoffTime: new Date(Date.now() - (matches.length - i) * 1800_000),
      },
    });

    await prisma.matchPrediction.upsert({
      where: { userId_matchId: { userId: user.id, matchId: matches[i].id } },
      update: { predictedOutcome: actualOutcome, isSubmitted: true, isScored: false, pointsAwarded: 0 },
      create: { userId: user.id, matchId: matches[i].id, predictedOutcome: actualOutcome, isSubmitted: true },
    });
  }

  console.log(`✓ All ${matches.length} group stage matches set to COMPLETED`);
  console.log(`✓ User: fixture@test.com (id: ${user.id})`);
  console.log('');
  console.log('Next steps (fires both scoring and group bonuses):');
  console.log('  curl -s -X POST http://localhost:4000/admin/cron/score \\');
  console.log('    -H "x-api-key: <CRON_API_KEY>" | jq .');
}

run()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
