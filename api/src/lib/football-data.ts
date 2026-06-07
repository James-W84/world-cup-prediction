import { config } from '../config';

const BASE_URL = 'https://api.football-data.org/v4';

export interface FDTeam {
  id: number;
  name: string;
  shortName: string;
  tla: string;
  crest: string;
}

export interface FDScore {
  winner: 'HOME_TEAM' | 'AWAY_TEAM' | 'DRAW' | null;
  duration: 'REGULAR' | 'EXTRA_TIME' | 'PENALTY_SHOOTOUT';
  fullTime: { home: number | null; away: number | null };
  halfTime: { home: number | null; away: number | null };
}

export interface FDMatch {
  id: number;
  utcDate: string;
  status: string;
  stage: string;
  group: string | null;
  matchday: number | null;
  homeTeam: FDTeam | null;
  awayTeam: FDTeam | null;
  score: FDScore;
  lastUpdated: string;
}

interface FDMatchesResponse {
  resultSet: { count: number; played: number };
  matches: FDMatch[];
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'X-Auth-Token': config.footballData.apiKey },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`football-data.org ${res.status}: ${body}`);
  }

  return res.json() as Promise<T>;
}

export async function fetchWCMatches(): Promise<FDMatch[]> {
  const data = await get<FDMatchesResponse>('/competitions/WC/matches');
  return data.matches;
}

export function mapStatus(status: string): 'UPCOMING' | 'LIVE' | 'COMPLETED' {
  if (status === 'IN_PLAY' || status === 'PAUSED') return 'LIVE';
  if (status === 'FINISHED') return 'COMPLETED';
  return 'UPCOMING';
}

export function mapStage(stage: string): 'GROUP' | 'LAST_32' | 'ROUND_OF_16' | 'QF' | 'SF' | 'FINAL' {
  switch (stage) {
    case 'LAST_32': return 'LAST_32';
    case 'LAST_16':
    case 'ROUND_OF_16': return 'ROUND_OF_16';
    case 'QUARTER_FINALS': return 'QF';
    case 'SEMI_FINALS': return 'SF';
    case 'FINAL': return 'FINAL';
    case 'THIRD_PLACE': return 'SF';
    default: return 'GROUP';
  }
}

export function getOutcome(match: FDMatch): 'HOME_WIN' | 'AWAY_WIN' | 'DRAW' | null {
  const winner = match.score.winner;
  if (winner === 'HOME_TEAM') return 'HOME_WIN';
  if (winner === 'AWAY_TEAM') return 'AWAY_WIN';
  if (winner === 'DRAW') return 'DRAW';
  return null;
}
