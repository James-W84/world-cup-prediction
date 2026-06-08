/**
 * Seeds knockout matches with realistic team names for UI testing.
 * Run: npx ts-node -r dotenv/config src/scripts/seed-knockout-teams.ts
 *
 * Uses the same groups as seed.ts — assigns winner/runner-up based on alphabetical
 * ordering (arbitrary, just for testability). Idempotent: updates existing records.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";

function createClient() {
  const url = process.env.DATABASE_URL || "";
  if (url.startsWith("file:")) {
    return new PrismaClient({ adapter: new PrismaBetterSqlite3({ url }) } as any);
  }
  return new PrismaClient({ adapter: new PrismaPg(new Pool({ connectionString: url })) } as any);
}

const prisma = createClient();

// Deterministic fake winners based on seed.ts group teams (sorted for consistency)
const FAKE_WINNERS: Record<string, string> = {
  A: "Mexico", B: "Canada", C: "Brazil", D: "United States",
  E: "Germany", F: "Netherlands", G: "Belgium", H: "Spain",
  I: "France", J: "Argentina", K: "Portugal", L: "England",
};
const FAKE_RUNNERS: Record<string, string> = {
  A: "South Korea", B: "Switzerland", C: "Morocco", D: "Australia",
  E: "Ivory Coast", F: "Japan", G: "Iran", H: "Uruguay",
  I: "Senegal", J: "Algeria", K: "Colombia", L: "Croatia",
};

function resolve(placeholder: string): string {
  // "Winner A" → FAKE_WINNERS["A"], "Runner-up B" → FAKE_RUNNERS["B"]
  const winnerMatch = placeholder.match(/^Winner ([A-L])$/);
  if (winnerMatch) return FAKE_WINNERS[winnerMatch[1]] ?? placeholder;

  const runnerMatch = placeholder.match(/^Runner-up ([A-L])$/);
  if (runnerMatch) return FAKE_RUNNERS[runnerMatch[1]] ?? placeholder;

  // "Best 3rd" slots — assign third-place teams
  const best3rdTeams = ["Ecuador", "Sweden", "Egypt", "Cabo Verde", "Norway", "Austria", "Uzbekistan", "Ghana"];
  if (placeholder.startsWith("Best 3rd")) {
    const idx = parseInt(placeholder.replace(/\D/g, "").slice(-1)) % best3rdTeams.length;
    return best3rdTeams[idx] ?? placeholder;
  }

  // Knockout propagation: "Winner M74" etc — use the match's resolved teams
  return placeholder;
}

// R16 / QF / SF / Final teams derived from resolved R32
const r32Resolved = [
  { home: resolve("Runner-up A"), away: resolve("Runner-up B") },
  { home: resolve("Winner E"), away: "Ecuador" },
  { home: resolve("Winner F"), away: resolve("Runner-up C") },
  { home: resolve("Winner C"), away: resolve("Runner-up F") },
  { home: resolve("Winner I"), away: "Sweden" },
  { home: resolve("Runner-up E"), away: resolve("Runner-up I") },
  { home: resolve("Winner A"), away: "Egypt" },
  { home: resolve("Winner L"), away: "Cabo Verde" },
  { home: resolve("Winner D"), away: "Norway" },
  { home: resolve("Winner G"), away: "Austria" },
  { home: resolve("Runner-up K"), away: resolve("Runner-up L") },
  { home: resolve("Winner H"), away: resolve("Runner-up J") },
  { home: resolve("Winner B"), away: "Uzbekistan" },
  { home: resolve("Winner J"), away: resolve("Runner-up H") },
  { home: resolve("Winner K"), away: "Ghana" },
  { home: resolve("Runner-up D"), away: resolve("Runner-up G") },
];

// Pick winner of each R32 pair (always the home team, for determinism)
const r16Teams = [
  { home: r32Resolved[1].home, away: r32Resolved[4].home },
  { home: r32Resolved[0].home, away: r32Resolved[2].home },
  { home: r32Resolved[3].home, away: r32Resolved[5].home },
  { home: r32Resolved[6].home, away: r32Resolved[7].home },
  { home: r32Resolved[10].home, away: r32Resolved[11].home },
  { home: r32Resolved[8].home, away: r32Resolved[9].home },
  { home: r32Resolved[13].home, away: r32Resolved[15].home },
  { home: r32Resolved[12].home, away: r32Resolved[14].home },
];

const qfTeams = [
  { home: r16Teams[0].home, away: r16Teams[1].home },
  { home: r16Teams[4].home, away: r16Teams[5].home },
  { home: r16Teams[2].home, away: r16Teams[3].home },
  { home: r16Teams[6].home, away: r16Teams[7].home },
];

const sfTeams = [
  { home: qfTeams[0].home, away: qfTeams[1].home },
  { home: qfTeams[2].home, away: qfTeams[3].home },
];

async function updateStage(
  stage: string,
  fakePairs: { home: string; away: string }[]
): Promise<number> {
  const matches = await prisma.match.findMany({
    where: { stage: stage as any },
    orderBy: { kickoffTime: "asc" },
  });

  let updated = 0;
  for (let i = 0; i < Math.min(matches.length, fakePairs.length); i++) {
    await prisma.match.update({
      where: { id: matches[i].id },
      data: { homeTeam: fakePairs[i].home, awayTeam: fakePairs[i].away },
    });
    updated++;
  }
  return updated;
}

async function main() {
  console.log("🌱 Seeding knockout matches with fake teams...\n");

  const r32Updated = await updateStage("LAST_32", r32Resolved);
  console.log(`✓ Round of 32: ${r32Updated} matches updated`);

  const r16Updated = await updateStage("ROUND_OF_16", r16Teams);
  console.log(`✓ Round of 16: ${r16Updated} matches updated`);

  const qfUpdated = await updateStage("QF", qfTeams);
  console.log(`✓ Quarterfinals: ${qfUpdated} matches updated`);

  const sfUpdated = await updateStage("SF", [
    ...sfTeams,
    { home: `3rd SF1`, away: `3rd SF2` }, // third-place play-off
  ]);
  console.log(`✓ Semifinals: ${sfUpdated} matches updated`);

  const finalUpdated = await updateStage("FINAL", [
    { home: sfTeams[0].home, away: sfTeams[1].home },
  ]);
  console.log(`✓ Final: ${finalUpdated} matches updated`);

  console.log("\n✅ Done — knockout matches now have real-looking team names.");
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("❌", err);
  process.exit(1);
});
