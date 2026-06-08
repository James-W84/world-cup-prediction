#!/usr/bin/env tsx
// Resets mutable test data in the LOCAL dev database.
// Run: DATABASE_URL=file:./prisma/dev.db npx tsx src/scripts/reset-test-data.ts
import 'dotenv/config';
import { prisma } from '../lib/prisma';

const url = process.env.DATABASE_URL ?? '';
if (!url.startsWith('file:')) {
  console.error('SAFETY: This script only runs against a local SQLite database (file: URL).');
  console.error(`Current DATABASE_URL starts with: ${url.slice(0, 20)}...`);
  process.exit(1);
}

const FAR_FUTURE = new Date('2030-01-01T00:00:00Z');

async function reset() {
  console.log(`Resetting test data in ${url}...`);

  await prisma.matchPrediction.deleteMany();
  await prisma.groupTableScore.deleteMany();
  await prisma.leagueJoinRequest.deleteMany();
  await prisma.leagueMember.deleteMany();
  await prisma.league.deleteMany();

  const { count } = await prisma.match.updateMany({
    data: { status: 'UPCOMING', actualOutcome: null, kickoffTime: FAR_FUTURE },
  });

  console.log(`✓ Cleared predictions, bonuses, leagues`);
  console.log(`✓ Reset ${count} matches → UPCOMING, kickoff 2030-01-01`);
  console.log('Note: Users are preserved. Delete manually if needed.');
}

reset()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
