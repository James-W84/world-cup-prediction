import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

// ─── DB connection (mirrors seed.ts) ────────────────────────────────────────

function createClient() {
  const url = process.env.DATABASE_URL || "";
  if (url.startsWith("file:")) {
    return new PrismaClient({
      adapter: new PrismaBetterSqlite3({ url }),
    } as any);
  }
  return new PrismaClient({
    adapter: new PrismaPg(new Pool({ connectionString: url })),
  } as any);
}

// ─── Expected data ───────────────────────────────────────────────────────────

// Each team is listed with its primary name and known API/display aliases.
// football-data.org names take precedence in prod; static seed names are the fallback.
const EXPECTED_GROUPS: Record<string, string[][]> = {
  A: [["Mexico"], ["South Africa"], ["South Korea"], ["Czechia", "Czech Republic"]],
  B: [
    ["Canada"],
    ["Bosnia & Herzegovina", "Bosnia and Herzegovina", "Bosnia-Herzegovina", "Bosnia & Herz."],
    ["Qatar"],
    ["Switzerland"],
  ],
  C: [["Brazil"], ["Morocco"], ["Haiti"], ["Scotland"]],
  D: [["United States", "USA"], ["Paraguay"], ["Australia"], ["Türkiye", "Turkey", "Turkiye"]],
  E: [["Germany"], ["Curaçao", "Curacao"], ["Ivory Coast", "Côte d'Ivoire"], ["Ecuador"]],
  F: [["Netherlands"], ["Japan"], ["Sweden"], ["Tunisia"]],
  G: [["Belgium"], ["Egypt"], ["Iran"], ["New Zealand"]],
  H: [["Spain"], ["Uruguay"], ["Saudi Arabia"], ["Cabo Verde", "Cape Verde", "Cape Verde Islands"]],
  I: [["France"], ["Senegal"], ["Norway"], ["Iraq"]],
  J: [["Argentina"], ["Algeria"], ["Austria"], ["Jordan"]],
  K: [["Portugal"], ["DR Congo", "Congo DR"], ["Uzbekistan"], ["Colombia"]],
  L: [["England"], ["Croatia"], ["Ghana"], ["Panama"]],
};

// Actual 2026 WC schedule from FIFA. End dates are exclusive.
// Group stage: June 11-27 (some matches UTC-shifted to June 28).
// Knockout: dates may be placeholder (2030-01-01) until group stage is complete.
const STAGE_DATE_RANGES: Record<string, { start: Date; end: Date }> = {
  GROUP:      { start: new Date("2026-06-11"), end: new Date("2026-06-29") },
  LAST_32:    { start: new Date("2026-06-28"), end: new Date("2026-07-04") },
  ROUND_OF_16:{ start: new Date("2026-07-04"), end: new Date("2026-07-08") },
  QF:         { start: new Date("2026-07-09"), end: new Date("2026-07-12") },
  SF:         { start: new Date("2026-07-14"), end: new Date("2026-07-19") }, // includes 3rd-place July 18
  FINAL:      { start: new Date("2026-07-19"), end: new Date("2026-07-20") },
};

// football-data.org uses this placeholder when a match's exact date is TBD
// (common for knockout matches before group stage resolves participants)
const PLACEHOLDER_YEAR = 2029;

const EXPECTED_STAGE_COUNTS: Record<string, number> = {
  GROUP: 72,
  LAST_32: 16,
  ROUND_OF_16: 8,
  QF: 4,
  SF: 3, // 2 semis + 1 third-place play-off (mapped to SF by seed/API)
  FINAL: 1,
};

// ─── Reporting ───────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const failures: string[] = [];

function ok(label: string) {
  console.log(`  ✅ ${label}`);
  passed++;
}

function fail(label: string) {
  console.log(`  ❌ ${label}`);
  failed++;
  failures.push(label);
}

function section(title: string) {
  console.log(`\n── ${title} ${"─".repeat(Math.max(0, 60 - title.length))}`);
}

function matchesAlias(name: string, aliases: string[]): boolean {
  return aliases.some((a) => a.toLowerCase() === name.toLowerCase());
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function validate() {
  const prisma = createClient();

  try {
    console.log("🔍 World Cup 2026 Production Data Validator");
    console.log(`   DATABASE_URL: ${(process.env.DATABASE_URL || "").replace(/:\/\/[^@]+@/, "://<redacted>@")}`);

    // ── 1. Match counts ────────────────────────────────────────────────────
    section("Match counts");

    const total = await prisma.match.count();
    const EXPECTED_TOTAL = Object.values(EXPECTED_STAGE_COUNTS).reduce((a, b) => a + b, 0);
    total === EXPECTED_TOTAL
      ? ok(`Total matches = ${total}`)
      : fail(`Total matches = ${total}, expected ${EXPECTED_TOTAL}`);

    const byStageCounts = await prisma.match.groupBy({
      by: ["stage"],
      _count: { id: true },
    });
    const stageMap = Object.fromEntries(
      byStageCounts.map((r) => [r.stage, r._count.id])
    );
    for (const [stage, expected] of Object.entries(EXPECTED_STAGE_COUNTS)) {
      const actual = stageMap[stage] ?? 0;
      actual === expected
        ? ok(`${stage} count = ${actual}`)
        : fail(`${stage} count = ${actual}, expected ${expected}`);
    }

    // ── 2. Group integrity ─────────────────────────────────────────────────
    section("Group integrity (12 groups × 4 teams × 6 matches)");

    const groupMatches = await prisma.match.findMany({
      where: { stage: "GROUP" },
      select: { homeTeam: true, awayTeam: true, group: true },
    });

    const matchesByGroup: Record<string, { home: string; away: string }[]> = {};
    for (const m of groupMatches) {
      if (!m.group) {
        fail(`GROUP match missing group field: ${m.homeTeam} vs ${m.awayTeam}`);
        continue;
      }
      (matchesByGroup[m.group] ??= []).push({ home: m.homeTeam, away: m.awayTeam });
    }

    const groupCount = Object.keys(matchesByGroup).length;
    groupCount === 12
      ? ok(`12 groups present (found: ${Object.keys(matchesByGroup).sort().join(", ")})`)
      : fail(`Expected 12 groups, found ${groupCount}: ${Object.keys(matchesByGroup).sort().join(", ")}`);

    for (const group of Object.keys(EXPECTED_GROUPS).sort()) {
      const matches = matchesByGroup[group] ?? [];

      if (matches.length !== 6) {
        fail(`Group ${group}: ${matches.length} matches, expected 6`);
        continue;
      }

      const teams = new Set<string>();
      for (const m of matches) {
        teams.add(m.home);
        teams.add(m.away);
      }

      if (teams.size !== 4) {
        fail(`Group ${group}: ${teams.size} distinct teams, expected 4 — found: ${[...teams].join(", ")}`);
        continue;
      }

      // Check each expected team is present (with alias tolerance)
      const expectedTeams = EXPECTED_GROUPS[group];
      const unmatched: string[] = [];
      const foundNames: string[] = [];

      for (const aliases of expectedTeams) {
        const found = [...teams].find((t) => matchesAlias(t, aliases));
        if (found) {
          const canonical = aliases[0];
          foundNames.push(found === canonical ? found : `${found} (ok, expected "${canonical}")`);
        } else {
          unmatched.push(aliases[0]);
        }
      }

      const extraTeams = [...teams].filter(
        (t) => !expectedTeams.some((aliases) => matchesAlias(t, aliases))
      );

      if (unmatched.length > 0 || extraTeams.length > 0) {
        const parts: string[] = [];
        if (unmatched.length) parts.push(`missing: ${unmatched.join(", ")}`);
        if (extraTeams.length) parts.push(`unexpected: ${extraTeams.join(", ")}`);
        fail(`Group ${group} team mismatch — ${parts.join(" | ")}`);
      } else {
        ok(`Group ${group}: ${foundNames.join(", ")}`);
      }
    }

    // ── 3. Knockout stage — no group field ────────────────────────────────
    section("Knockout matches have no group field");

    const knockoutWithGroup = await prisma.match.count({
      where: {
        stage: { in: ["LAST_32", "ROUND_OF_16", "QF", "SF", "FINAL"] },
        group: { not: null },
      },
    });
    knockoutWithGroup === 0
      ? ok(`All knockout matches have group = null`)
      : fail(`${knockoutWithGroup} knockout matches incorrectly have a group field`);

    // ── 4. Date range validation ───────────────────────────────────────────
    section("Kickoff date ranges");

    for (const [stage, { start, end }] of Object.entries(STAGE_DATE_RANGES)) {
      const earliest = await prisma.match.findFirst({
        where: { stage: stage as any },
        orderBy: { kickoffTime: "asc" },
        select: { kickoffTime: true },
      });
      const latest = await prisma.match.findFirst({
        where: { stage: stage as any },
        orderBy: { kickoffTime: "desc" },
        select: { kickoffTime: true },
      });

      const earliestYear = earliest?.kickoffTime.getFullYear() ?? 0;
      const latestYear = latest?.kickoffTime.getFullYear() ?? 0;

      // Knockout matches use placeholder dates until group stage resolves; that's expected.
      if (stage !== "GROUP" && earliestYear >= PLACEHOLDER_YEAR) {
        ok(`${stage}: dates are TBD placeholders (${earliest?.kickoffTime.toISOString().slice(0, 10)}) — normal before group stage completes`);
        continue;
      }

      const outOfRange = await prisma.match.count({
        where: {
          stage: stage as any,
          OR: [
            { kickoffTime: { lt: start } },
            { kickoffTime: { gte: end } },
          ],
        },
      });

      if (outOfRange > 0) {
        fail(
          `${stage}: ${outOfRange} match(es) outside expected range ${start.toISOString().slice(0, 10)} – ${end.toISOString().slice(0, 10)}` +
          ` (actual: ${earliest?.kickoffTime.toISOString().slice(0, 10)} – ${latest?.kickoffTime.toISOString().slice(0, 10)})`
        );
      } else {
        ok(
          `${stage}: ${earliest?.kickoffTime.toISOString().slice(0, 10)} – ${latest?.kickoffTime.toISOString().slice(0, 10)} ✓`
        );
      }
    }

    // ── 5. API seeding indicator ───────────────────────────────────────────
    section("API seeding (footballDataId)");

    const withId = await prisma.match.count({ where: { footballDataId: { not: null } } });
    const withoutId = await prisma.match.count({ where: { footballDataId: null } });

    if (withId === total && withoutId === 0) {
      ok(`All ${total} matches have footballDataId — seeded from football-data.org API`);
    } else if (withId === 0) {
      fail(`No matches have footballDataId — data came from static fallback seed, not the API`);
    } else {
      fail(`Mixed: ${withId} matches have footballDataId, ${withoutId} do not`);
    }

    // ── 6. Duplicate detection ─────────────────────────────────────────────
    section("Duplicate matches");

    // Find any (homeTeam, awayTeam, stage) combinations that appear more than once
    const allGroupMatchPairs = await prisma.match.findMany({
      where: { stage: "GROUP" },
      select: { homeTeam: true, awayTeam: true, group: true },
    });

    const seen = new Map<string, number>();
    for (const m of allGroupMatchPairs) {
      // Normalize team order to catch A vs B and B vs A as duplicates
      const key = [m.group, ...[m.homeTeam, m.awayTeam].sort()].join("|");
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }
    const dupes = [...seen.entries()].filter(([, count]) => count > 1);
    dupes.length === 0
      ? ok("No duplicate group stage matches")
      : fail(`${dupes.length} duplicate match pair(s): ${dupes.map(([k]) => k).join(", ")}`);

    // ── Summary ────────────────────────────────────────────────────────────
    console.log("\n" + "═".repeat(62));
    console.log(`  RESULT: ${passed} passed, ${failed} failed`);
    if (failures.length > 0) {
      console.log("\n  Failed checks:");
      for (const f of failures) console.log(`    • ${f}`);
    }
    console.log("═".repeat(62) + "\n");

    process.exit(failed > 0 ? 1 : 0);
  } finally {
    await prisma.$disconnect();
  }
}

validate().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
