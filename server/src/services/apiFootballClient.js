import { env } from "../config/env.js";

export class ApiFootballClient {
  constructor({ baseUrl, key, host, worldCupLeagueId, season }) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.key = key;
    this.host = host;
    this.worldCupLeagueId = worldCupLeagueId;
    this.season = season;
  }

  async get(path, query = {}) {
    if (!this.key) {
      throw new Error("API_FOOTBALL_KEY is not configured.");
    }

    const url = new URL(`${this.baseUrl}${path}`);

    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }

    const headers = {
      Accept: "application/json",
      "x-apisports-key": this.key
    };

    if (this.host) {
      headers["x-rapidapi-host"] = this.host;
    }

    const response = await fetch(url, { headers });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      const error = new Error(payload?.message ?? `API-Football request failed with ${response.status}`);
      error.status = response.status;
      error.provider = "api-football";
      error.details = payload;
      throw error;
    }

    return payload;
  }

  getFixturesByDate(date) {
    return this.get("/fixtures", {
      date,
      league: this.worldCupLeagueId,
      season: this.season
    });
  }

  getPredictionByFixtureId(fixtureId) {
    return this.get("/predictions", {
      fixture: fixtureId
    });
  }
}

export const apiFootballClient = new ApiFootballClient(env.apiFootball);
