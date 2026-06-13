import { env } from "../config/env.js";

export class OddsApiClient {
  constructor({ baseUrl, key, regions, worldCupOutrightSportKey }) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.key = key;
    this.regions = regions;
    this.worldCupOutrightSportKey = worldCupOutrightSportKey;
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

    const url = new URL(`${this.baseUrl}/sports/${this.worldCupOutrightSportKey}/odds`);
    url.searchParams.set("apiKey", this.key);
    url.searchParams.set("regions", this.regions);
    url.searchParams.set("markets", "outrights");
    url.searchParams.set("oddsFormat", "decimal");

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
      data: payload,
      provider: "the-odds-api",
      configured: true,
      quota: {
        remaining: response.headers.get("x-requests-remaining"),
        used: response.headers.get("x-requests-used"),
        last: response.headers.get("x-requests-last")
      }
    };
  }
}

export const oddsApiClient = new OddsApiClient(env.oddsApi);
