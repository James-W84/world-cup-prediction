const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw Object.assign(new Error(body.error || `HTTP ${res.status}`), { status: res.status });
  }

  const body = await res.json();
  return body.data;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(data) }),
  put: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(data) }),
};

// Auth
export const getMe = () => api.get<User>('/auth/me');
export const logout = () => api.post('/auth/logout');

// Matches
export async function getMatches(stage: string): Promise<{ matches: Match[]; knockoutLocked: boolean }> {
  const res = await fetch(`${API_URL}/matches?stage=${stage}`, { credentials: 'include' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.json();
  return { matches: body.data as Match[], knockoutLocked: Boolean(body.knockoutLocked) };
}

// Predictions
export const savePrediction = (data: { matchId: string; predictedOutcome: string }) =>
  api.post<MatchPrediction>('/predictions', data);
export const getPrediction = (matchId: string) =>
  api.get<MatchPrediction | null>(`/predictions?matchId=${matchId}`);
export const submitPrediction = (predictionId: string) =>
  api.post<MatchPrediction>(`/predictions/${predictionId}/submit`);

// Home dashboard
export const getHomeDashboard = () => api.get<HomeDashboard>('/home');

// Leagues
export const createLeague = (name: string) => api.post<League>('/leagues', { name });
export const joinLeague = (inviteCode: string) => api.post<League>('/leagues/join', { inviteCode });
export const getLeague = (leagueId: string) => api.get<League>(`/leagues/${leagueId}`);
export const getLeaderboard = (leagueId: string, page = 0) =>
  api.get<LeaderboardResponse>(`/leagues/${leagueId}/leaderboard?page=${page}&limit=50`);

// Types
export interface User {
  id: string;
  email: string;
  username: string;
  avatarUrl: string | null;
  totalPoints: number;
}

export interface Match {
  id: string;
  homeTeam: string;
  awayTeam: string;
  kickoffTime: string;
  stage: string;
  group: string | null;
  status: 'UPCOMING' | 'LIVE' | 'COMPLETED';
  actualOutcome: string | null;
  predictions?: MatchPrediction[];
}

export interface MatchPrediction {
  id: string;
  matchId: string;
  predictedOutcome: string;
  isSubmitted: boolean;
  isScored: boolean;
  pointsAwarded: number;
  updatedAt: string;
}

export interface League {
  id: string;
  name: string;
  inviteCode: string;
  members?: { user: User }[];
}

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  username: string;
  avatarUrl: string | null;
  totalPoints: number;
}

export interface LeaderboardResponse {
  leaderboard: LeaderboardEntry[];
  pagination: { page: number; limit: number; total: number; hasMore: boolean };
}

export interface UpcomingMatchPredictionSlim {
  id: string;
  predictedOutcome: string;
  isSubmitted: boolean;
  updatedAt: string;
}

export interface UpcomingMatchWithPrediction extends Omit<Match, 'predictions'> {
  predictions: UpcomingMatchPredictionSlim[];
}

export interface PredictionStats {
  total: number;
  submitted: number;
  scored: number;
  correct: number;
}

export interface HomeDashboard {
  upcomingMatches: UpcomingMatchWithPrediction[];
  predictionStats: PredictionStats;
}
