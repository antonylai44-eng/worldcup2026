import { env } from "../config/env.js";
import { cache, ttl } from "./cache.js";
import { oddsApiClient } from "./oddsApiClient.js";
import { sportmonksClient } from "./sportmonksClient.js";

function requireWorldCupSeasonId() {
  if (!env.sportmonks.worldCupSeasonId) {
    throw new Error("SPORTMONKS_WORLD_CUP_SEASON_ID is not configured.");
  }

  return env.sportmonks.worldCupSeasonId;
}

function isKnockoutStageName(name = "") {
  return /round of|last 32|last 16|quarter|semi|third|final/i.test(name);
}

function normalizeSchedulesForBracket(schedules = []) {
  return schedules
    .map((schedule) => {
      const round = schedule.round ?? {};
      const stage = round.stage ?? schedule.stage ?? {};

      return {
        scheduleId: schedule.id,
        roundId: round.id,
        roundName: round.name,
        stageId: stage.id,
        stageName: stage.name,
        fixtures: (schedule.fixtures ?? []).map((fixture) => ({
          id: fixture.id,
          name: fixture.name,
          startingAt: fixture.starting_at,
          state: fixture.state,
          participants: fixture.participants ?? [],
          scores: fixture.scores ?? []
        }))
      };
    })
    .filter((item) => isKnockoutStageName(`${item.stageName} ${item.roundName}`));
}

export async function getTournamentSummary() {
  const seasonId = requireWorldCupSeasonId();

  return cache.remember(`tournament-summary:${seasonId}`, ttl.fixtures, async () => {
    const [standings, schedules, stages, rounds, live] = await Promise.all([
      sportmonksClient.getSeasonStandings(seasonId),
      sportmonksClient.getSeasonSchedules(seasonId),
      sportmonksClient.getSeasonStages(seasonId),
      sportmonksClient.getSeasonRounds(seasonId),
      sportmonksClient.getLiveScores()
    ]);

    return {
      data: {
        seasonId,
        standings: standings.data ?? [],
        schedules: schedules.data ?? [],
        stages: stages.data ?? [],
        rounds: rounds.data ?? [],
        live: live.data ?? []
      },
      meta: {
        provider: "sportmonks",
        rateLimit: {
          standings: standings.rate_limit,
          schedules: schedules.rate_limit,
          stages: stages.rate_limit,
          rounds: rounds.rate_limit,
          live: live.rate_limit
        }
      }
    };
  });
}

export async function getStandings() {
  const seasonId = requireWorldCupSeasonId();

  return cache.remember(`standings:${seasonId}`, ttl.standings, async () => {
    const standings = await sportmonksClient.getSeasonStandings(seasonId);

    return {
      data: standings.data ?? [],
      meta: {
        provider: "sportmonks",
        rateLimit: standings.rate_limit
      }
    };
  });
}

export async function getBracket() {
  const seasonId = requireWorldCupSeasonId();

  return cache.remember(`bracket:${seasonId}`, ttl.bracket, async () => {
    const schedules = await sportmonksClient.getSeasonSchedules(seasonId);
    const bracket = normalizeSchedulesForBracket(schedules.data ?? []);

    return {
      data: bracket,
      meta: {
        provider: "sportmonks",
        rateLimit: schedules.rate_limit
      }
    };
  });
}

export async function getLiveScores() {
  return cache.remember("live-scores", ttl.live, async () => {
    const live = await sportmonksClient.getLiveScores();

    return {
      data: live.data ?? [],
      meta: {
        provider: "sportmonks",
        rateLimit: live.rate_limit
      }
    };
  });
}

export async function getFixtureForecast(fixtureId) {
  return cache.remember(`fixture-forecast:${fixtureId}`, ttl.predictions, async () => {
    const forecast = await sportmonksClient.getFixtureProbabilities(fixtureId);

    return {
      data: forecast.data ?? [],
      meta: {
        provider: "sportmonks",
        rateLimit: forecast.rate_limit
      }
    };
  });
}

export async function getChampionOdds() {
  return cache.remember("champion-outrights", ttl.odds, async () => oddsApiClient.getChampionOutrights());
}
