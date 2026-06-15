import { env } from "../config/env.js";
import { apiFootballClient } from "./apiFootballClient.js";
import { cache, ttl } from "./cache.js";
import { oddsApiClient } from "./oddsApiClient.js";
import { sportmonksClient } from "./sportmonksClient.js";
import { canonicalTeamName, matchKey } from "./teamName.js";

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

function firstItem(value) {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

function resolveFixturePayload(rawFixture) {
  const fixture = firstItem(rawFixture?.data) ?? rawFixture?.fixture ?? rawFixture;
  const participants = fixture?.participants ?? fixture?.fixture?.participants ?? [];
  const homeTeam =
    participants.find((participant) => participant.meta?.location === "home")?.name ?? participants[0]?.name ?? "Home team";
  const awayTeam =
    participants.find((participant) => participant.meta?.location === "away")?.name ?? participants[1]?.name ?? "Away team";
  const kickoff = fixture?.starting_at ?? fixture?.startingAt ?? fixture?.fixture?.starting_at ?? fixture?.fixture?.startingAt;
  const status = fixture?.state?.short_name ?? fixture?.state?.name ?? fixture?.fixture?.state?.name ?? "Upcoming";

  return {
    id: fixture?.id,
    name: fixture?.name ?? `${homeTeam} vs ${awayTeam}`,
    kickoff,
    status,
    homeTeam,
    awayTeam,
    participants
  };
}

function toProbability(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const normalized = Number(String(value).replace("%", ""));
  return Number.isFinite(normalized) ? normalized : null;
}

function sortOutcomes(outcomes) {
  return [...outcomes].sort((left, right) => right.probability - left.probability);
}

function confidenceLabel(edge) {
  if (edge === null || edge === undefined) {
    return "pending";
  }

  if (edge >= 15) {
    return "strong";
  }

  if (edge >= 7) {
    return "balanced";
  }

  return "tight";
}

function normalizeOutcomeLabel(key, fixture) {
  if (key === "draw") {
    return "Draw";
  }

  return key === "home" ? fixture.homeTeam : fixture.awayTeam;
}

function normalizeSportmonksForecast(rawForecast, fixture) {
  const winnerMarket = (rawForecast?.data ?? []).find((item) =>
    /winner|fulltime|1x2/i.test(`${item?.type?.name ?? ""} ${item?.type?.code ?? ""}`)
  );

  const probabilities = {
    homeWin: null,
    draw: null,
    awayWin: null
  };

  for (const prediction of winnerMarket?.predictions ?? []) {
    const value = String(prediction?.value ?? "").trim().toLowerCase();
    const probability = toProbability(prediction?.probability);

    if (probability === null) {
      continue;
    }

    if (["1", "home", canonicalTeamName(fixture.homeTeam)].includes(value)) {
      probabilities.homeWin = probability;
      continue;
    }

    if (["x", "draw", "tie"].includes(value)) {
      probabilities.draw = probability;
      continue;
    }

    if (["2", "away", canonicalTeamName(fixture.awayTeam)].includes(value)) {
      probabilities.awayWin = probability;
    }
  }

  const outcomes = sortOutcomes(
    [
      { key: "home", probability: probabilities.homeWin },
      { key: "draw", probability: probabilities.draw },
      { key: "away", probability: probabilities.awayWin }
    ].filter((outcome) => outcome.probability !== null)
  );
  const lead = outcomes[0];
  const runnerUp = outcomes[1];

  return {
    id: "sportmonks",
    name: "Sportmonks",
    configured: Boolean(env.sportmonks.token),
    available: Boolean(outcomes.length),
    probabilities,
    pick: lead ? normalizeOutcomeLabel(lead.key, fixture) : null,
    confidence: confidenceLabel(lead && runnerUp ? lead.probability - runnerUp.probability : null),
    market: winnerMarket?.type?.name ?? "1X2",
    message: outcomes.length ? undefined : "Sportmonks did not return a 1X2 probability market for this fixture."
  };
}

function parseApiFootballFixture(payload, fixture) {
  const fixtures = payload?.response ?? [];

  return fixtures.find((candidate) => {
    const teams = candidate?.teams ?? {};
    const homeTeam = teams.home?.name;
    const awayTeam = teams.away?.name;

    return (
      canonicalTeamName(homeTeam) === canonicalTeamName(fixture.homeTeam) &&
      canonicalTeamName(awayTeam) === canonicalTeamName(fixture.awayTeam)
    );
  });
}

function normalizeApiFootballForecast(predictionPayload, fixture) {
  const prediction = firstItem(predictionPayload?.response);
  const percent = prediction?.predictions?.percent ?? {};
  const probabilities = {
    homeWin: toProbability(percent.home),
    draw: toProbability(percent.draw),
    awayWin: toProbability(percent.away)
  };
  const outcomes = sortOutcomes(
    [
      { key: "home", probability: probabilities.homeWin },
      { key: "draw", probability: probabilities.draw },
      { key: "away", probability: probabilities.awayWin }
    ].filter((outcome) => outcome.probability !== null)
  );
  const lead = outcomes[0];
  const runnerUp = outcomes[1];
  const winnerName = prediction?.predictions?.winner?.name;

  return {
    id: "api-football",
    name: "API-Football",
    configured: Boolean(env.apiFootball.key),
    available: Boolean(outcomes.length),
    probabilities,
    pick: winnerName || (lead ? normalizeOutcomeLabel(lead.key, fixture) : null),
    confidence: confidenceLabel(lead && runnerUp ? lead.probability - runnerUp.probability : null),
    advice: prediction?.predictions?.advice,
    expectedGoals: prediction?.predictions?.goals,
    message: outcomes.length ? undefined : "API-Football did not return percentages for this fixture."
  };
}

function normalizeOddsForecast(oddsPayload, fixture) {
  const event = (oddsPayload?.data ?? []).find((candidate) => {
    const sameMatch = matchKey(candidate?.home_team, candidate?.away_team) === matchKey(fixture.homeTeam, fixture.awayTeam);
    if (!sameMatch) {
      return false;
    }

    if (!fixture.kickoff || !candidate?.commence_time) {
      return true;
    }

    const kickoffMs = new Date(fixture.kickoff).getTime();
    const eventMs = new Date(candidate.commence_time).getTime();
    return Math.abs(kickoffMs - eventMs) <= 12 * 60 * 60 * 1000;
  });

  const samples = {
    [fixture.homeTeam]: [],
    Draw: [],
    [fixture.awayTeam]: []
  };

  for (const bookmaker of event?.bookmakers ?? []) {
    for (const market of bookmaker?.markets ?? []) {
      if (market?.key !== "h2h") {
        continue;
      }

      const implied = [];
      for (const outcome of market?.outcomes ?? []) {
        const price = Number(outcome?.price);
        if (Number.isFinite(price) && price > 1) {
          implied.push({
            name: outcome.name,
            probability: 1 / price
          });
        }
      }

      const total = implied.reduce((sum, outcome) => sum + outcome.probability, 0);
      if (!total) {
        continue;
      }

      for (const outcome of implied) {
        const normalized = (outcome.probability / total) * 100;
        const canonical = canonicalTeamName(outcome.name);
        if (canonical === canonicalTeamName(fixture.homeTeam)) {
          samples[fixture.homeTeam].push(normalized);
        } else if (canonical === canonicalTeamName(fixture.awayTeam)) {
          samples[fixture.awayTeam].push(normalized);
        } else if (canonical === "draw") {
          samples.Draw.push(normalized);
        }
      }
    }
  }

  const probabilities = {
    homeWin: samples[fixture.homeTeam].length
      ? samples[fixture.homeTeam].reduce((sum, value) => sum + value, 0) / samples[fixture.homeTeam].length
      : null,
    draw: samples.Draw.length ? samples.Draw.reduce((sum, value) => sum + value, 0) / samples.Draw.length : null,
    awayWin: samples[fixture.awayTeam].length
      ? samples[fixture.awayTeam].reduce((sum, value) => sum + value, 0) / samples[fixture.awayTeam].length
      : null
  };
  const outcomes = sortOutcomes(
    [
      { key: "home", probability: probabilities.homeWin },
      { key: "draw", probability: probabilities.draw },
      { key: "away", probability: probabilities.awayWin }
    ].filter((outcome) => outcome.probability !== null)
  );
  const lead = outcomes[0];
  const runnerUp = outcomes[1];

  return {
    id: "the-odds-api",
    name: "The Odds API",
    configured: Boolean(env.oddsApi.key),
    available: Boolean(outcomes.length),
    probabilities,
    pick: lead ? normalizeOutcomeLabel(lead.key, fixture) : null,
    confidence: confidenceLabel(lead && runnerUp ? lead.probability - runnerUp.probability : null),
    bookmakers: event?.bookmakers?.length ?? 0,
    message: outcomes.length ? undefined : "The Odds API did not return a matching h2h market for this fixture."
  };
}

function buildConsensus(providers, fixture) {
  const probabilityProviders = providers.filter(
    (provider) =>
      provider.available &&
      [provider.probabilities?.homeWin, provider.probabilities?.draw, provider.probabilities?.awayWin].some(
        (value) => value !== null
      )
  );

  if (!probabilityProviders.length) {
    return {
      providerCount: 0,
      probabilities: {
        homeWin: null,
        draw: null,
        awayWin: null
      },
      pick: null,
      confidence: "pending",
      agreement: "pending"
    };
  }

  const average = (key) => {
    const values = probabilityProviders
      .map((provider) => provider.probabilities?.[key])
      .filter((value) => value !== null && value !== undefined);

    if (!values.length) {
      return null;
    }

    return values.reduce((sum, value) => sum + value, 0) / values.length;
  };

  const probabilities = {
    homeWin: average("homeWin"),
    draw: average("draw"),
    awayWin: average("awayWin")
  };
  const outcomes = sortOutcomes(
    [
      { key: "home", probability: probabilities.homeWin },
      { key: "draw", probability: probabilities.draw },
      { key: "away", probability: probabilities.awayWin }
    ].filter((outcome) => outcome.probability !== null)
  );
  const lead = outcomes[0];
  const runnerUp = outcomes[1];
  const picks = providers.map((provider) => provider.pick).filter(Boolean);
  const uniquePicks = new Set(picks);
  let agreement = "split";

  if (!picks.length) {
    agreement = "pending";
  } else if (uniquePicks.size === 1) {
    agreement = "aligned";
  } else if (uniquePicks.size < picks.length) {
    agreement = "partial";
  }

  return {
    providerCount: probabilityProviders.length,
    probabilities,
    pick: lead ? normalizeOutcomeLabel(lead.key, fixture) : null,
    confidence: confidenceLabel(lead && runnerUp ? lead.probability - runnerUp.probability : null),
    agreement
  };
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
    const [sportmonksProbabilities, fixtureResponse] = await Promise.all([
      sportmonksClient.getFixtureProbabilities(fixtureId),
      sportmonksClient.getFixtureById(fixtureId)
    ]);
    const fixture = resolveFixturePayload(firstItem(fixtureResponse?.data) ?? firstItem(sportmonksProbabilities?.data)?.fixture);
    const kickoffDate = fixture.kickoff ? new Date(fixture.kickoff).toISOString().slice(0, 10) : "";

    let apiFootballForecast = {
      id: "api-football",
      name: "API-Football",
      configured: Boolean(env.apiFootball.key),
      available: false,
      probabilities: { homeWin: null, draw: null, awayWin: null },
      pick: null,
      confidence: "pending",
      message: env.apiFootball.key ? "No API-Football match found for this fixture date." : "API_FOOTBALL_KEY is not configured."
    };

    if (env.apiFootball.key && kickoffDate) {
      try {
        const fixturesPayload = await apiFootballClient.getFixturesByDate(kickoffDate);
        const matchedFixture = parseApiFootballFixture(fixturesPayload, fixture);

        if (matchedFixture?.fixture?.id) {
          const predictionPayload = await apiFootballClient.getPredictionByFixtureId(matchedFixture.fixture.id);
          apiFootballForecast = normalizeApiFootballForecast(predictionPayload, fixture);
        }
      } catch (error) {
        apiFootballForecast = {
          ...apiFootballForecast,
          message: error.message
        };
      }
    }

    let oddsForecast = {
      id: "the-odds-api",
      name: "The Odds API",
      configured: Boolean(env.oddsApi.key),
      available: false,
      probabilities: { homeWin: null, draw: null, awayWin: null },
      pick: null,
      confidence: "pending",
      message: env.oddsApi.key ? "No matching h2h market found for this fixture." : "ODDS_API_KEY is not configured."
    };

    if (env.oddsApi.key && fixture.kickoff) {
      const kickoffMs = new Date(fixture.kickoff).getTime();
      const commenceTimeFrom = new Date(kickoffMs - 24 * 60 * 60 * 1000).toISOString();
      const commenceTimeTo = new Date(kickoffMs + 24 * 60 * 60 * 1000).toISOString();

      try {
        const oddsPayload = await oddsApiClient.getMatchOdds({
          commenceTimeFrom,
          commenceTimeTo
        });
        oddsForecast = normalizeOddsForecast(oddsPayload, fixture);
      } catch (error) {
        oddsForecast = {
          ...oddsForecast,
          message: error.message
        };
      }
    }

    const providers = [
      normalizeSportmonksForecast(sportmonksProbabilities, fixture),
      apiFootballForecast,
      oddsForecast
    ];

    return {
      data: {
        fixture,
        providers,
        consensus: buildConsensus(providers, fixture)
      },
      meta: {
        providers: providers.map((provider) => provider.id),
        sourceSummary: providers.filter((provider) => provider.available).map((provider) => provider.name).join(" + "),
        rateLimit: {
          sportmonks: sportmonksProbabilities.rate_limit
        }
      }
    };
  });
}

export async function getChampionOdds() {
  return cache.remember("champion-outrights", ttl.odds, async () => oddsApiClient.getChampionOutrights());
}
