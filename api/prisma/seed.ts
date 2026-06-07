import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  fetchWCMatches,
  mapStatus,
  mapStage,
  getOutcome,
} from "../src/lib/football-data";

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

const prisma = createClient();

// 2026 FIFA World Cup — 48 teams, 12 groups of 4 teams
// Group stage:  12 × C(4,2) = 72 matches
// Knockout:     16 (R32) + 8 (R16) + 4 (QF) + 2 (SF) + 1 (3rd) + 1 (Final) = 32
// Total: 104 matches

interface MatchData {
  homeTeam: string;
  awayTeam: string;
  kickoffTime: Date;
  stage: "GROUP" | "LAST_32" | "ROUND_OF_16" | "QF" | "SF" | "FINAL";
  group?: string;
}

const groupTeams: Record<string, string[]> = {
  A: ["Mexico", "South Africa", "South Korea", "Czechia"],
  B: ["Canada", "Bosnia & Herzegovina", "Qatar", "Switzerland"],
  C: ["Brazil", "Morocco", "Haiti", "Scotland"],
  D: ["United States", "Paraguay", "Australia", "Türkiye"],
  E: ["Germany", "Curaçao", "Ivory Coast", "Ecuador"],
  F: ["Netherlands", "Japan", "Sweden", "Tunisia"],
  G: ["Belgium", "Egypt", "Iran", "New Zealand"],
  H: ["Spain", "Uruguay", "Saudi Arabia", "Cabo Verde"],
  I: ["France", "Senegal", "Norway", "Iraq"],
  J: ["Argentina", "Algeria", "Austria", "Jordan"],
  K: ["Portugal", "DR Congo", "Uzbekistan", "Colombia"],
  L: ["England", "Croatia", "Ghana", "Panama"],
};

const generateMatches = (): MatchData[] => {
  const matches: MatchData[] = [];

  // GROUP STAGE — 72 matches
  let groupMatchDate = new Date("2026-06-11T12:00:00Z");

  for (const [group, teams] of Object.entries(groupTeams)) {
    for (let i = 0; i < teams.length; i++) {
      for (let j = i + 1; j < teams.length; j++) {
        matches.push({
          homeTeam: teams[i],
          awayTeam: teams[j],
          kickoffTime: new Date(groupMatchDate),
          stage: "GROUP",
          group,
        });
        groupMatchDate = new Date(
          groupMatchDate.getTime() + 4 * 60 * 60 * 1000,
        );
      }
    }
  }

  // ROUND OF 32 — 16 matches (M73–M88), per Article 12.6 of FWC2026 Regulations.
  // "Best 3rd" slots are resolved via the 495-combination Annexe C after group stage.
  const r32: { home: string; away: string }[] = [
    { home: "Runner-up A", away: "Runner-up B" }, // M73
    { home: "Winner E", away: "Best 3rd (ABCDF)" }, // M74
    { home: "Winner F", away: "Runner-up C" }, // M75
    { home: "Winner C", away: "Runner-up F" }, // M76
    { home: "Winner I", away: "Best 3rd (CDFGH)" }, // M77
    { home: "Runner-up E", away: "Runner-up I" }, // M78
    { home: "Winner A", away: "Best 3rd (CEFHI)" }, // M79
    { home: "Winner L", away: "Best 3rd (EHIJK)" }, // M80
    { home: "Winner D", away: "Best 3rd (BEFIJ)" }, // M81
    { home: "Winner G", away: "Best 3rd (AEHIJ)" }, // M82
    { home: "Runner-up K", away: "Runner-up L" }, // M83
    { home: "Winner H", away: "Runner-up J" }, // M84
    { home: "Winner B", away: "Best 3rd (EFGIJ)" }, // M85
    { home: "Winner J", away: "Runner-up H" }, // M86
    { home: "Winner K", away: "Best 3rd (DEIJL)" }, // M87
    { home: "Runner-up D", away: "Runner-up G" }, // M88
  ];

  let r32Date = new Date("2026-07-01T12:00:00Z");
  for (const m of r32) {
    matches.push({ ...m, kickoffTime: new Date(r32Date), stage: "LAST_32" });
    r32Date = new Date(r32Date.getTime() + 6 * 60 * 60 * 1000);
  }

  // ROUND OF 16 — 8 matches (M89–M96), per Article 12.7
  const r16: { home: string; away: string }[] = [
    { home: "Winner M74", away: "Winner M77" }, // M89
    { home: "Winner M73", away: "Winner M75" }, // M90
    { home: "Winner M76", away: "Winner M78" }, // M91
    { home: "Winner M79", away: "Winner M80" }, // M92
    { home: "Winner M83", away: "Winner M84" }, // M93
    { home: "Winner M81", away: "Winner M82" }, // M94
    { home: "Winner M86", away: "Winner M88" }, // M95
    { home: "Winner M85", away: "Winner M87" }, // M96
  ];

  let r16Date = new Date("2026-07-08T12:00:00Z");
  for (const m of r16) {
    matches.push({
      ...m,
      kickoffTime: new Date(r16Date),
      stage: "ROUND_OF_16",
    });
    r16Date = new Date(r16Date.getTime() + 8 * 60 * 60 * 1000);
  }

  // QUARTER-FINALS — 4 matches (M97–M100), per Article 12.8
  const qf: { home: string; away: string }[] = [
    { home: "Winner M89", away: "Winner M90" }, // M97
    { home: "Winner M93", away: "Winner M94" }, // M98
    { home: "Winner M91", away: "Winner M92" }, // M99
    { home: "Winner M95", away: "Winner M96" }, // M100
  ];

  let qfDate = new Date("2026-07-15T12:00:00Z");
  for (const m of qf) {
    matches.push({ ...m, kickoffTime: new Date(qfDate), stage: "QF" });
    qfDate = new Date(qfDate.getTime() + 12 * 60 * 60 * 1000);
  }

  // SEMI-FINALS — 2 matches (M101–M102), per Article 12.9
  matches.push({
    homeTeam: "Winner M97",
    awayTeam: "Winner M98",
    kickoffTime: new Date("2026-07-19T15:00:00Z"),
    stage: "SF",
  });
  matches.push({
    homeTeam: "Winner M99",
    awayTeam: "Winner M100",
    kickoffTime: new Date("2026-07-20T15:00:00Z"),
    stage: "SF",
  });

  // THIRD-PLACE PLAY-OFF — 1 match (M103), per Article 12.10
  matches.push({
    homeTeam: "Runner-up SF1",
    awayTeam: "Runner-up SF2",
    kickoffTime: new Date("2026-07-25T15:00:00Z"),
    stage: "SF",
  });

  // FINAL — 1 match (M104), per Article 12.11
  matches.push({
    homeTeam: "Winner SF1",
    awayTeam: "Winner SF2",
    kickoffTime: new Date("2026-07-26T18:00:00Z"),
    stage: "FINAL",
  });

  return matches;
};

async function seedFromApi(): Promise<boolean> {
  try {
    console.log("Fetching WC 2026 matches from football-data.org...");
    const apiMatches = await fetchWCMatches();
    console.log(`Fetched ${apiMatches.length} matches from API`);

    for (const m of apiMatches) {
      await prisma.match.upsert({
        where: { footballDataId: m.id },
        create: {
          footballDataId: m.id,
          homeTeam: m.homeTeam?.name ?? "TBD",
          awayTeam: m.awayTeam?.name ?? "TBD",
          kickoffTime: new Date(m.utcDate),
          stage: mapStage(m.stage),
          group: m.group ? m.group.replace("GROUP_", "") : null,
          status: mapStatus(m.status),
          actualOutcome: getOutcome(m),
        },
        update: {
          homeTeam: m.homeTeam?.name ?? "TBD",
          awayTeam: m.awayTeam?.name ?? "TBD",
          kickoffTime: new Date(m.utcDate),
          stage: mapStage(m.stage),
          group: m.group ? m.group.replace("GROUP_", "") : null,
          status: mapStatus(m.status),
          actualOutcome: getOutcome(m),
        },
      });
    }
    return true;
  } catch (err) {
    console.warn("API seed failed, falling back to static data:", err);
    return false;
  }
}

async function seed() {
  try {
    console.log("🌱 Starting World Cup 2026 data seeding...");

    const apiOk = await seedFromApi();

    if (!apiOk) {
      const existingMatches = await prisma.match.count();
      if (existingMatches > 0) {
        console.log(
          `✓ Matches already exist (${existingMatches}). Skipping static seed.`,
        );
      } else {
        const matchesData = generateMatches();
        const created = await prisma.match.createMany({ data: matchesData });
        console.log(`✓ Created ${created.count} matches from static data`);
      }
    }

    const total = await prisma.match.count();
    console.log(`✅ Seeding done — ${total} matches in DB`);
  } catch (error) {
    console.error("❌ Seeding failed:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

seed();
