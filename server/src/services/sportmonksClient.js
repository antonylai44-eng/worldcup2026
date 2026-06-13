import { env } from "../config/env.js";

export class SportmonksClient {
  constructor({ baseUrl, token }) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.token = token;
  }

  async get(path, query = {}) {
    if (!this.token) {
      throw new Error("SPORTMONKS_API_TOKEN is not configured.");
    }

    const url = new URL(`${this.baseUrl}${path}`);
    url.searchParams.set("api_token", this.token);

    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, value);
      }
    }

    const response = await fetch(url, {
      headers: {
        Accept: "application/json"
      }
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      const message = payload?.message ?? `Sportmonks request failed with ${response.status}`;
      const error = new Error(message);
      error.status = response.status;
      error.provider = "sportmonks";
      error.details = payload;
      throw error;
    }

    return payload;
  }

  getSeasonStandings(seasonId) {
    return this.get(`/standings/seasons/${seasonId}`, {
      include: "participant;group;details.type"
    });
  }

  getSeasonSchedules(seasonId) {
    return this.get(`/schedules/seasons/${seasonId}`, {
      include: "round.stage;fixtures.participants;fixtures.scores;fixtures.state"
    });
  }

  getSeasonStages(seasonId) {
    return this.get(`/stages/seasons/${seasonId}`, {
      include: "league;season"
    });
  }

  getSeasonRounds(seasonId) {
    return this.get(`/rounds/seasons/${seasonId}`, {
      include: "stage"
    });
  }

  getLiveScores() {
    return this.get("/livescores/inplay", {
      include: "participants;scores;state;periods;events"
    });
  }

  getLatestUpdatedLivescores() {
    return this.get("/livescores/latest", {
      include: "participants;scores;state"
    });
  }

  getFixtureProbabilities(fixtureId) {
    return this.get(`/predictions/probabilities/fixtures/${fixtureId}`, {
      include: "type;fixture.participants"
    });
  }
}

export const sportmonksClient = new SportmonksClient(env.sportmonks);
