export function getApiUrl(): string {
  if (process.env.NODE_ENV === 'production') return '/api';

  return process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '') ?? 'http://localhost:4000';
}

export function getGoogleAuthUrl(): string {
  const base = typeof window !== 'undefined' ? window.location.origin : '';
  const url = new URL(`${getApiUrl()}/auth/google`, base);

  if (typeof window !== 'undefined') {
    url.searchParams.set('returnTo', window.location.origin);
  }

  return url.toString();
}

export function startGoogleAuth(): void {
  window.location.assign(getGoogleAuthUrl());
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${getApiUrl()}${path}`, {
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
  const res = await fetch(`${getApiUrl()}/matches?stage=${stage}`, { credentials: 'include' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.json();
  return { matches: body.data as Match[], knockoutLocked: Boolean(body.knockoutLocked) };
}

// Group standings
export async function getGroupStandings(): Promise<Record<string, GroupStanding[]>> {
  const res = await fetch(`${getApiUrl()}/groups/standings`, { credentials: 'include' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.json();
  return body.data as Record<string, GroupStanding[]>;
}

// Predictions
export const savePrediction = (data: { matchId: string; predictedOutcome: string; isSubmitted?: boolean }) =>
  api.post<MatchPrediction>('/predictions', data);
export const getPrediction = (matchId: string) =>
  api.get<MatchPrediction | null>(`/predictions?matchId=${matchId}`);
export const submitPrediction = (predictionId: string) =>
  api.post<MatchPrediction>(`/predictions/${predictionId}/submit`);

// Home dashboard
export async function getHomeDashboard(offset = 0): Promise<HomeDashboard> {
  const res = await fetch(`${getApiUrl()}/home?offset=${offset}`, { credentials: 'include' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.json();
  return body.data as HomeDashboard;
}

// Leagues
export const getMyLeagues = () => api.get<LeagueWithStatus[]>('/leagues');
export const createLeague = (name: string) => api.post<League>('/leagues', { name });
export const joinLeague = (inviteCode: string) =>
  api.post<{ league: League; joinStatus: string }>('/leagues/join', { inviteCode });
export const getLeague = (leagueId: string) => api.get<League>(`/leagues/${leagueId}`);
export const getLeaderboard = (leagueId: string, page = 0) =>
  api.get<LeaderboardResponse>(`/leagues/${leagueId}/leaderboard?page=${page}&limit=50`);
export const getJoinRequests = (leagueId: string) =>
  api.get<JoinRequest[]>(`/leagues/${leagueId}/requests`);
export const approveRequest = (leagueId: string, requestId: string) =>
  api.post(`/leagues/${leagueId}/requests/${requestId}/approve`);
export const denyRequest = (leagueId: string, requestId: string) =>
  api.post(`/leagues/${leagueId}/requests/${requestId}/deny`);
export const removeMember = (leagueId: string, memberId: string) =>
  request(`/leagues/${leagueId}/members/${memberId}`, { method: 'DELETE' });
export const deleteLeague = (leagueId: string) =>
  request(`/leagues/${leagueId}`, { method: 'DELETE' });

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
  homeScore: number | null;
  awayScore: number | null;
  predictions?: MatchPrediction[];
}

export interface GroupStanding {
  team: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  points: number;
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
  createdBy?: string;
  isAdmin?: boolean;
  pendingRequestCount?: number;
  joinStatus?: string;
  members?: { user: User }[];
}

export interface LeagueWithCount extends League {
  _count: { members: number };
}

export interface LeagueWithStatus extends LeagueWithCount {
  joinStatus: 'member' | 'pending';
}

export interface JoinRequest {
  id: string;
  userId: string;
  leagueId: string;
  status: 'PENDING' | 'APPROVED' | 'DENIED';
  createdAt: string;
  user: { id: string; username: string; avatarUrl: string | null };
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

export interface StageStats {
  submitted: number;
  scored: number;
  correct: number;
}

export interface HomeDashboard {
  upcomingMatches: UpcomingMatchWithPrediction[];
  totalUpcoming: number;
  pendingByStage: { group: number; knockout: number };
  predictionStats: {
    group: StageStats;
    knockout: StageStats;
  };
}
