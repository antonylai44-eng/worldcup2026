const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000";

export type ApiEnvelope<T> = {
  data: T;
  meta?: Record<string, unknown>;
  cache?: {
    hit: boolean;
    key: string;
    ttlMs: number;
  };
};

export type TeamParticipant = {
  id: number;
  name: string;
  image_path?: string;
  meta?: {
    location?: "home" | "away";
    winner?: boolean;
  };
};

export type Fixture = {
  id: number;
  name?: string;
  startingAt?: string;
  state?: {
    id: number;
    name: string;
    short_name?: string;
  };
  participants: TeamParticipant[];
  scores: Array<{
    id: number;
    participant_id?: number;
    score?: {
      goals?: number;
      participant?: string;
    };
    description?: string;
  }>;
};

export type BracketRound = {
  scheduleId: number;
  roundId?: number;
  roundName?: string;
  stageId?: number;
  stageName?: string;
  fixtures: Fixture[];
};

export type StandingRow = {
  id: number;
  position?: number;
  participant?: TeamParticipant;
  group?: {
    name: string;
  };
  details?: Array<{
    value?: number;
    type?: {
      code?: string;
      name?: string;
    };
  }>;
};

export type TournamentSummary = {
  seasonId: string;
  standings: StandingRow[];
  schedules: unknown[];
  stages: unknown[];
  rounds: unknown[];
  live: Fixture[];
};

export type ForecastProvider = {
  id: string;
  name: string;
  configured: boolean;
  available: boolean;
  probabilities: {
    homeWin: number | null;
    draw: number | null;
    awayWin: number | null;
  };
  pick: string | null;
  confidence: "strong" | "balanced" | "tight" | "pending" | string;
  market?: string;
  message?: string;
  advice?: string;
  expectedGoals?: {
    home?: string;
    away?: string;
  };
  bookmakers?: number;
};

export type Forecast = {
  fixture: {
    id?: number;
    name?: string;
    kickoff?: string;
    status?: string;
    homeTeam: string;
    awayTeam: string;
  };
  providers: ForecastProvider[];
  consensus: {
    providerCount: number;
    probabilities: {
      homeWin: number | null;
      draw: number | null;
      awayWin: number | null;
    };
    pick: string | null;
    confidence: "strong" | "balanced" | "tight" | "pending" | string;
    agreement: "aligned" | "partial" | "split" | "pending" | string;
  };
};

export type ChampionOddsResponse = {
  provider: string;
  configured: boolean;
  data: Array<{
    bookmakers?: Array<{
      title: string;
      markets?: Array<{
        key: string;
        outcomes?: Array<{
          name: string;
          price: number;
        }>;
      }>;
    }>;
  }>;
};

async function request<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`);
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload?.error ?? `Request failed with ${response.status}`);
  }

  return payload;
}

export const worldCupApi = {
  getSummary: () => request<ApiEnvelope<TournamentSummary>>("/api/tournament/summary"),
  getBracket: () => request<ApiEnvelope<BracketRound[]>>("/api/tournament/bracket"),
  getStandings: () => request<ApiEnvelope<StandingRow[]>>("/api/tournament/standings"),
  getLiveScores: () => request<ApiEnvelope<Fixture[]>>("/api/tournament/live"),
  getForecast: (fixtureId: number | string) => request<ApiEnvelope<Forecast>>(`/api/forecast/match/${fixtureId}`),
  getChampionOdds: () => request<ChampionOddsResponse>("/api/odds/champion"),
  liveScoresStreamUrl: `${API_BASE_URL}/api/tournament/live/stream`
};
