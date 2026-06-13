import dotenv from "dotenv";

dotenv.config();

const required = ["SPORTMONKS_API_TOKEN", "SPORTMONKS_WORLD_CUP_SEASON_ID"];

for (const key of required) {
  if (!process.env[key]) {
    console.warn(`[config] Missing ${key}. Provider-backed routes will fail until it is set.`);
  }
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 4000),
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:5173",
  sportmonks: {
    token: process.env.SPORTMONKS_API_TOKEN ?? "",
    baseUrl: process.env.SPORTMONKS_BASE_URL ?? "https://api.sportmonks.com/v3/football",
    worldCupSeasonId: process.env.SPORTMONKS_WORLD_CUP_SEASON_ID ?? ""
  },
  oddsApi: {
    key: process.env.ODDS_API_KEY ?? "",
    baseUrl: process.env.ODDS_API_BASE_URL ?? "https://api.the-odds-api.com/v4",
    worldCupOutrightSportKey:
      process.env.ODDS_API_WORLD_CUP_OUTRIGHT_SPORT_KEY ?? "soccer_fifa_world_cup_winner",
    regions: process.env.ODDS_API_REGIONS ?? "us,uk,eu"
  }
};
