import { useEffect, useMemo, useState } from "react";
import type { BracketRound, ChampionOddsResponse, Fixture, TournamentSummary } from "../api/worldCupApi";
import { worldCupApi } from "../api/worldCupApi";
import { ChampionOddsTable } from "./ChampionOddsTable";
import { ForecastCard } from "./ForecastCard";
import { KnockoutBracket } from "./KnockoutBracket";

function nextFixture(summary?: TournamentSummary) {
  const fixtures = summary?.schedules.flatMap((schedule) => {
    const maybeSchedule = schedule as { fixtures?: Fixture[] };
    return maybeSchedule.fixtures ?? [];
  });

  return fixtures?.find((fixture) => fixture.state?.name?.toLowerCase().includes("not started"));
}

export function TournamentDashboard() {
  const [summary, setSummary] = useState<TournamentSummary>();
  const [bracket, setBracket] = useState<BracketRound[]>([]);
  const [liveScores, setLiveScores] = useState<Fixture[]>([]);
  const [odds, setOdds] = useState<ChampionOddsResponse>();
  const [forecast, setForecast] = useState<Awaited<ReturnType<typeof worldCupApi.getForecast>>["data"]>([]);
  const [error, setError] = useState<string>();

  const upcomingFixture = useMemo(() => nextFixture(summary), [summary]);

  useEffect(() => {
    async function loadDashboard() {
      try {
        const [summaryResponse, bracketResponse, oddsResponse] = await Promise.all([
          worldCupApi.getSummary(),
          worldCupApi.getBracket(),
          worldCupApi.getChampionOdds()
        ]);

        setSummary(summaryResponse.data);
        setLiveScores(summaryResponse.data.live);
        setBracket(bracketResponse.data);
        setOdds(oddsResponse);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Unable to load tournament data.");
      }
    }

    loadDashboard();
  }, []);

  useEffect(() => {
    if (!upcomingFixture?.id) {
      return;
    }

    worldCupApi
      .getForecast(upcomingFixture.id)
      .then((response) => setForecast(response.data))
      .catch(() => setForecast([]));
  }, [upcomingFixture?.id]);

  useEffect(() => {
    const stream = new EventSource(worldCupApi.liveScoresStreamUrl);

    stream.addEventListener("live-scores", (event) => {
      const payload = JSON.parse((event as MessageEvent).data);
      setLiveScores(payload.data ?? []);
    });

    stream.addEventListener("error", () => {
      stream.close();
    });

    return () => stream.close();
  }, []);

  return (
    <main className="min-h-screen bg-[#eef4f1]">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex flex-col justify-between gap-3 border-b border-slate-300 pb-4 md:flex-row md:items-end">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-pitch">2026 FIFA World Cup</p>
            <h1 className="mt-1 text-3xl font-bold text-ink md:text-4xl">Tournament Control Room</h1>
          </div>
          <div className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-600">
            Live matches: <span className="font-semibold text-ink">{liveScores.length}</span>
          </div>
        </header>

        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
        ) : null}

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <KnockoutBracket rounds={bracket} />
          <div className="flex flex-col gap-5">
            <ForecastCard fixture={upcomingFixture} forecast={forecast} />
            <ChampionOddsTable odds={odds} />
          </div>
        </div>
      </div>
    </main>
  );
}
