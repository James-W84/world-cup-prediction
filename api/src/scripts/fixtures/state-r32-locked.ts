#!/usr/bin/env tsx
// Sets the first R32 match kickoff to 1 hour ago — locks all knockout predictions.
// Tests that users can no longer submit/update knockout predictions.
// Run: DATABASE_URL=file:./prisma/dev.db npx tsx src/scripts/fixtures/state-r32-locked.ts
import 'dotenv/config';
import { prisma } from '../../lib/prisma';

const url = process.env.DATABASE_URL ?? '';
if (!url.startsWith('file:')) {
  console.error('SAFETY: This script only runs against a local SQLite database (file: URL).');
  process.exit(1);
}

async function run() {
  console.log('Setting first R32 match kickoff to 1 hour ago...');

  const firstR32 = await prisma.match.findFirst({
    where: { stage: 'LAST_32' },
    orderBy: { kickoffTime: 'asc' },
  });

  if (!firstR32) {
    console.error('No LAST_32 matches found. Run seed first.');
    process.exit(1);
  }

  const oneHourAgo = new Date(Date.now() - 3600_000);
  await prisma.match.update({
    where: { id: firstR32.id },
    data: { kickoffTime: oneHourAgo },
  });

  console.log(`✓ Match: ${firstR32.homeTeam} vs ${firstR32.awayTeam}`);
  console.log(`✓ Kickoff set to: ${oneHourAgo.toISOString()} (1 hour ago)`);
  console.log('');
  console.log('Effect: ALL knockout predictions (R32, R16, QF, SF, FINAL) are now locked.');
  console.log('Group stage predictions remain open (each locked individually by their own kickoff).');
  console.log('');
  console.log('To verify via UI: try to edit a knockout bracket prediction — should be disabled.');
}

run()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
