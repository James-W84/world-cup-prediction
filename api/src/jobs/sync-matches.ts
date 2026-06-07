import { fetchWCMatches, mapStatus, mapStage, getOutcome } from '../lib/football-data';
import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';

export async function syncMatchesFromApi(): Promise<{ created: number; updated: number }> {
  logger.info('Syncing WC matches from football-data.org...');

  let apiMatches;
  try {
    apiMatches = await fetchWCMatches();
  } catch (err) {
    logger.warn('football-data.org unavailable, skipping match sync', err);
    return { created: 0, updated: 0 };
  }

  let created = 0;
  let updated = 0;

  for (const m of apiMatches) {
    const homeTeam = m.homeTeam?.name ?? 'TBD';
    const awayTeam = m.awayTeam?.name ?? 'TBD';
    const kickoffTime = new Date(m.utcDate);
    const stage = mapStage(m.stage);
    const status = mapStatus(m.status);
    const actualOutcome = getOutcome(m);
    const group = m.group ? m.group.replace('GROUP_', '') : null;

    const existing = await prisma.match.findUnique({ where: { footballDataId: m.id } });

    if (existing) {
      await prisma.match.update({
        where: { id: existing.id },
        data: { homeTeam, awayTeam, kickoffTime, stage, status, actualOutcome, group },
      });
      updated++;
    } else {
      await prisma.match.create({
        data: { footballDataId: m.id, homeTeam, awayTeam, kickoffTime, stage, status, actualOutcome, group },
      });
      created++;
    }
  }

  logger.info(`Match sync done: ${created} created, ${updated} updated`);
  return { created, updated };
}
