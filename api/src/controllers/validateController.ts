import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { config } from '../config';

// ─── Expected data ────────────────────────────────────────────────────────────

// Each team listed with primary name first, then known API/display aliases.
const EXPECTED_GROUPS: Record<string, string[][]> = {
  A: [['Mexico'], ['South Africa'], ['South Korea'], ['Czechia', 'Czech Republic']],
  B: [
    ['Canada'],
    ['Bosnia & Herzegovina', 'Bosnia and Herzegovina', 'Bosnia-Herzegovina', 'Bosnia & Herz.'],
    ['Qatar'],
    ['Switzerland'],
  ],
  C: [['Brazil'], ['Morocco'], ['Haiti'], ['Scotland']],
  D: [['United States', 'USA'], ['Paraguay'], ['Australia'], ['Türkiye', 'Turkey', 'Turkiye']],
  E: [['Germany'], ['Curaçao', 'Curacao'], ['Ivory Coast', "Côte d'Ivoire"], ['Ecuador']],
  F: [['Netherlands'], ['Japan'], ['Sweden'], ['Tunisia']],
  G: [['Belgium'], ['Egypt'], ['Iran'], ['New Zealand']],
  H: [['Spain'], ['Uruguay'], ['Saudi Arabia'], ['Cabo Verde', 'Cape Verde', 'Cape Verde Islands']],
  I: [['France'], ['Senegal'], ['Norway'], ['Iraq']],
  J: [['Argentina'], ['Algeria'], ['Austria'], ['Jordan']],
  K: [['Portugal'], ['DR Congo', 'Congo DR'], ['Uzbekistan'], ['Colombia']],
  L: [['England'], ['Croatia'], ['Ghana'], ['Panama']],
};

const EXPECTED_STAGE_COUNTS: Record<string, number> = {
  GROUP: 72,
  LAST_32: 16,
  ROUND_OF_16: 8,
  QF: 4,
  SF: 3, // 2 semis + 1 third-place play-off
  FINAL: 1,
};

// Actual 2026 WC schedule from FIFA. End dates are exclusive.
const STAGE_DATE_RANGES: Record<string, { start: Date; end: Date }> = {
  GROUP:       { start: new Date('2026-06-11'), end: new Date('2026-06-29') },
  LAST_32:     { start: new Date('2026-06-28'), end: new Date('2026-07-04') },
  ROUND_OF_16: { start: new Date('2026-07-04'), end: new Date('2026-07-08') },
  QF:          { start: new Date('2026-07-09'), end: new Date('2026-07-12') },
  SF:          { start: new Date('2026-07-14'), end: new Date('2026-07-19') },
  FINAL:       { start: new Date('2026-07-19'), end: new Date('2026-07-20') },
};

// football-data.org uses placeholder dates for knockout matches until teams are known
const PLACEHOLDER_YEAR = 2029;

// ─── Helper ───────────────────────────────────────────────────────────────────

function matchesAlias(name: string, aliases: string[]): boolean {
  return aliases.some((a) => a.toLowerCase() === name.toLowerCase());
}

interface CheckResult {
  check: string;
  passed: boolean;
  detail?: string;
}

// ─── Controller ───────────────────────────────────────────────────────────────

export const validateController = {
  run: async (req: Request, res: Response): Promise<void> => {
    if (req.headers['x-api-key'] !== config.cron.apiKey) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const results: CheckResult[] = [];
    const pass = (check: string, detail?: string) => results.push({ check, passed: true, detail });
    const fail = (check: string, detail: string) => results.push({ check, passed: false, detail });

    // ── 1. Match counts ─────────────────────────────────────────────────────
    const total = await prisma.match.count();
    const expectedTotal = Object.values(EXPECTED_STAGE_COUNTS).reduce((a, b) => a + b, 0);
    total === expectedTotal
      ? pass('total match count', `${total}`)
      : fail('total match count', `got ${total}, expected ${expectedTotal}`);

    const byStageCounts = await prisma.match.groupBy({ by: ['stage'], _count: { id: true } });
    const stageMap = Object.fromEntries(byStageCounts.map((r) => [r.stage, r._count.id]));
    for (const [stage, expected] of Object.entries(EXPECTED_STAGE_COUNTS)) {
      const actual = stageMap[stage] ?? 0;
      actual === expected
        ? pass(`${stage} count`, `${actual}`)
        : fail(`${stage} count`, `got ${actual}, expected ${expected}`);
    }

    // ── 2. Group integrity ──────────────────────────────────────────────────
    const groupMatches = await prisma.match.findMany({
      where: { stage: 'GROUP' },
      select: { homeTeam: true, awayTeam: true, group: true },
    });

    const matchesByGroup: Record<string, { home: string; away: string }[]> = {};
    let missingGroupField = 0;
    for (const m of groupMatches) {
      if (!m.group) { missingGroupField++; continue; }
      (matchesByGroup[m.group] ??= []).push({ home: m.homeTeam, away: m.awayTeam });
    }
    if (missingGroupField > 0) fail('group field on GROUP matches', `${missingGroupField} matches missing group field`);

    const groupCount = Object.keys(matchesByGroup).length;
    groupCount === 12
      ? pass('12 groups present', Object.keys(matchesByGroup).sort().join(', '))
      : fail('12 groups present', `found ${groupCount}: ${Object.keys(matchesByGroup).sort().join(', ')}`);

    for (const group of Object.keys(EXPECTED_GROUPS).sort()) {
      const matches = matchesByGroup[group] ?? [];
      if (matches.length !== 6) {
        fail(`group ${group} match count`, `got ${matches.length}, expected 6`);
        continue;
      }

      const teams = new Set([...matches.flatMap((m) => [m.home, m.away])]);
      if (teams.size !== 4) {
        fail(`group ${group} team count`, `${teams.size} distinct teams: ${[...teams].join(', ')}`);
        continue;
      }

      const unmatched: string[] = [];
      const foundNames: string[] = [];
      for (const aliases of EXPECTED_GROUPS[group]) {
        const found = [...teams].find((t) => matchesAlias(t, aliases));
        found
          ? foundNames.push(found === aliases[0] ? found : `${found} (alias for "${aliases[0]}")`)
          : unmatched.push(aliases[0]);
      }
      const unexpected = [...teams].filter((t) => !EXPECTED_GROUPS[group].some((a) => matchesAlias(t, a)));

      if (unmatched.length || unexpected.length) {
        const parts: string[] = [];
        if (unmatched.length) parts.push(`missing: ${unmatched.join(', ')}`);
        if (unexpected.length) parts.push(`unexpected: ${unexpected.join(', ')}`);
        fail(`group ${group} teams`, parts.join(' | '));
      } else {
        pass(`group ${group} teams`, foundNames.join(', '));
      }
    }

    // ── 3. Knockout matches have no group field ─────────────────────────────
    const knockoutWithGroup = await prisma.match.count({
      where: { stage: { in: ['LAST_32', 'ROUND_OF_16', 'QF', 'SF', 'FINAL'] }, group: { not: null } },
    });
    knockoutWithGroup === 0
      ? pass('knockout matches have no group field')
      : fail('knockout matches have no group field', `${knockoutWithGroup} matches incorrectly have group set`);

    // ── 4. Date ranges ──────────────────────────────────────────────────────
    for (const [stage, { start, end }] of Object.entries(STAGE_DATE_RANGES)) {
      const earliest = await prisma.match.findFirst({
        where: { stage: stage as any },
        orderBy: { kickoffTime: 'asc' },
        select: { kickoffTime: true },
      });
      const latest = await prisma.match.findFirst({
        where: { stage: stage as any },
        orderBy: { kickoffTime: 'desc' },
        select: { kickoffTime: true },
      });

      const earliestYear = earliest?.kickoffTime.getFullYear() ?? 0;
      if (stage !== 'GROUP' && earliestYear >= PLACEHOLDER_YEAR) {
        pass(`${stage} dates`, `TBD placeholders (${earliest?.kickoffTime.toISOString().slice(0, 10)}) — normal before group stage completes`);
        continue;
      }

      const outOfRange = await prisma.match.count({
        where: {
          stage: stage as any,
          OR: [{ kickoffTime: { lt: start } }, { kickoffTime: { gte: end } }],
        },
      });
      const range = `${earliest?.kickoffTime.toISOString().slice(0, 10)} – ${latest?.kickoffTime.toISOString().slice(0, 10)}`;
      outOfRange === 0
        ? pass(`${stage} dates`, range)
        : fail(`${stage} dates`, `${outOfRange} match(es) outside ${start.toISOString().slice(0, 10)}–${end.toISOString().slice(0, 10)}, actual range: ${range}`);
    }

    // ── 5. API seeding indicator ────────────────────────────────────────────
    const withId = await prisma.match.count({ where: { footballDataId: { not: null } } });
    const withoutId = total - withId;
    if (withId === total) {
      pass('footballDataId coverage', `all ${total} matches seeded from football-data.org API`);
    } else if (withId === 0) {
      fail('footballDataId coverage', 'no matches have footballDataId — static fallback seed was used, not the API');
    } else {
      fail('footballDataId coverage', `mixed: ${withId} with ID, ${withoutId} without`);
    }

    // ── 6. Duplicate group matches ──────────────────────────────────────────
    const allGroupPairs = await prisma.match.findMany({
      where: { stage: 'GROUP' },
      select: { homeTeam: true, awayTeam: true, group: true },
    });
    const seen = new Map<string, number>();
    for (const m of allGroupPairs) {
      const key = [m.group, ...[m.homeTeam, m.awayTeam].sort()].join('|');
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }
    const dupes = [...seen.entries()].filter(([, count]) => count > 1);
    dupes.length === 0
      ? pass('no duplicate group matches')
      : fail('no duplicate group matches', dupes.map(([k]) => k).join(', '));

    // ── Summary ─────────────────────────────────────────────────────────────
    const failed = results.filter((r) => !r.passed);
    res.status(failed.length > 0 ? 200 : 200).json({
      success: failed.length === 0,
      summary: { passed: results.length - failed.length, failed: failed.length, total: results.length },
      results,
    });
  },
};
