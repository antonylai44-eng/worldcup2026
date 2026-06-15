import { env } from "../config/env.js";

export class OddsApiClient {
  constructor({ baseUrl, key, regions, matchSportKey, worldCupOutrightSportKey }) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.key = key;
    this.regions = regions;
    this.matchSportKey = matchSportKey;
    this.worldCupOutrightSportKey = worldCupOutrightSportKey;
  }

  async get(path, query = {}) {
    if (!this.key) {
      throw new Error("ODDS_API_KEY is not configured.");
    }

    const url = new URL(`${this.baseUrl}${path}`);

    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }

    const response = await fetch(url, {
      headers: {
        Accept: "application/json"
      }
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      const error = new Error(payload?.message ?? `The Odds API request failed with ${response.status}`);
      error.status = response.status;
      error.provider = "the-odds-api";
      error.details = payload;
      throw error;
    }

    return {
      payload,
      quota: {
        remaining: response.headers.get("x-requests-remaining"),
        used: response.headers.get("x-requests-used"),
        last: response.headers.get("x-requests-last")
      }
    };
  }

  async getChampionOutrights() {
    if (!this.key) {
      return {
        data: [],
        provider: "the-odds-api",
        configured: false,
        message: "ODDS_API_KEY is not configured."
      };
    }

    const { payload, quota } = await this.get(`/sports/${this.worldCupOutrightSportKey}/odds`, {
      apiKey: this.key,
      regions: this.regions,
      markets: "outrights",
      oddsFormat: "decimal"
    });

    return {
      data: payload,
      provider: "the-odds-api",
      configured: true,
      quota
    };
  }

  async getMatchOdds({ commenceTimeFrom, commenceTimeTo } = {}) {
    if (!this.key) {
      return {
        data: [],
        provider: "the-odds-api",
        configured: false,
        message: "ODDS_API_KEY is not configured."
      };
    }

    const { payload, quota } = await this.get(`/sports/${this.matchSportKey}/odds`, {
      apiKey: this.key,
      regions: this.regions,
      markets: "h2h",
      oddsFormat: "decimal",
      dateFormat: "iso",
      commenceTimeFrom,
      commenceTimeTo
    });

    return {
      data: payload,
      provider: "the-odds-api",
      configured: true,
      quota
    };
  }
}

export const oddsApiClient = new OddsApiClient(env.oddsApi);
