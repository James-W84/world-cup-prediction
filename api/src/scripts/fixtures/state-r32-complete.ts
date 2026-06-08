#!/usr/bin/env tsx
// Completes all 16 R32 matches. Useful for testing R16 unlock behavior and scoring.
// Run: DATABASE_URL=file:./prisma/dev.db npx tsx src/scripts/fixtures/state-r32-complete.ts
import 'dotenv/config';
import { prisma } from '../../lib/prisma';

const url = process.env.DATABASE_URL ?? '';
if (!url.startsWith('file:')) {
  console.error('SAFETY: This script only runs against a local SQLite database (file: URL).');
  process.exit(1);
}

async function run() {
  console.log('Setting all R32 matches to COMPLETED...');

  const r32Matches = await prisma.match.findMany({
    where: { stage: 'LAST_32' },
    orderBy: { kickoffTime: 'asc' },
  });

  if (r32Matches.length !== 16) {
    console.error(`Expected 16 R32 matches, found ${r32Matches.length}. Run seed first.`);
    process.exit(1);
  }

  const user = await prisma.user.upsert({
    where: { email: 'fixture@test.com' },
    update: {},
    create: { email: 'fixture@test.com', username: 'fixture-user', totalPoints: 0 },
  });

  for (let i = 0; i < r32Matches.length; i++) {
    await prisma.match.update({
      where: { id: r32Matches[i].id },
      data: {
        status: 'COMPLETED',
        actualOutcome: 'HOME_WIN',
        kickoffTime: new Date(Date.now() - (r32Matches.length - i) * 3600_000),
      },
    });

    await prisma.matchPrediction.upsert({
      where: { userId_matchId: { userId: user.id, matchId: r32Matches[i].id } },
      update: { predictedOutcome: 'HOME_WIN', isSubmitted: true, isScored: false, pointsAwarded: 0 },
      create: { userId: user.id, matchId: r32Matches[i].id, predictedOutcome: 'HOME_WIN', isSubmitted: true },
    });
  }

  console.log(`✓ ${r32Matches.length} R32 matches set to COMPLETED (all HOME_WIN)`);
  console.log(`✓ User: fixture@test.com (id: ${user.id})`);
  console.log('');
  console.log('Next steps:');
  console.log('  curl -s -X POST http://localhost:4000/admin/cron/score \\');
  console.log('    -H "x-api-key: <CRON_API_KEY>" | jq .');
  console.log('');
  console.log('Expected: fixture-user earns 16 points (1pt × 16 correct R32 predictions)');
}

run()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
