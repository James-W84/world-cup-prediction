#!/usr/bin/env tsx
// Seeds Group A (all 6 matches COMPLETED) with a test user and predictions.
// Run: DATABASE_URL=file:./prisma/dev.db npx tsx src/scripts/fixtures/state-group-a-complete.ts
//
// After running:
//   curl -s -X POST http://localhost:4000/admin/cron/score \
//     -H "x-api-key: $CRON_API_KEY" | jq .
//   sqlite3 prisma/dev.db "SELECT username, totalPoints FROM users WHERE email='fixture@test.com';"
import 'dotenv/config';
import { prisma } from '../../lib/prisma';

const url = process.env.DATABASE_URL ?? '';
if (!url.startsWith('file:')) {
  console.error('SAFETY: This script only runs against a local SQLite database (file: URL).');
  process.exit(1);
}

const OUTCOMES = ['HOME_WIN', 'AWAY_WIN', 'DRAW', 'HOME_WIN', 'AWAY_WIN', 'DRAW'] as const;

async function run() {
  console.log('Seeding Group A complete state...');

  const matches = await prisma.match.findMany({
    where: { stage: 'GROUP', group: 'A' },
    orderBy: { kickoffTime: 'asc' },
  });

  if (matches.length !== 6) {
    console.error(`Expected 6 Group A matches, found ${matches.length}. Run seed first.`);
    process.exit(1);
  }

  const user = await prisma.user.upsert({
    where: { email: 'fixture@test.com' },
    update: {},
    create: { email: 'fixture@test.com', username: 'fixture-user', totalPoints: 0 },
  });

  for (let i = 0; i < matches.length; i++) {
    const actualOutcome = OUTCOMES[i];
    await prisma.match.update({
      where: { id: matches[i].id },
      data: { status: 'COMPLETED', actualOutcome, kickoffTime: new Date(Date.now() - (6 - i) * 3600_000) },
    });

    await prisma.matchPrediction.upsert({
      where: { userId_matchId: { userId: user.id, matchId: matches[i].id } },
      update: { predictedOutcome: actualOutcome, isSubmitted: true, isScored: false, pointsAwarded: 0 },
      create: { userId: user.id, matchId: matches[i].id, predictedOutcome: actualOutcome, isSubmitted: true },
    });
  }

  console.log(`✓ Group A: ${matches.length} matches set to COMPLETED`);
  console.log(`✓ User: fixture@test.com (id: ${user.id})`);
  console.log('');
  console.log('Next steps:');
  console.log('  curl -s -X POST http://localhost:4000/admin/cron/score \\');
  console.log('    -H "x-api-key: <CRON_API_KEY>" | jq .');
  console.log('  sqlite3 prisma/dev.db "SELECT username, totalPoints FROM users WHERE email=\'fixture@test.com\';"');
}

run()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
