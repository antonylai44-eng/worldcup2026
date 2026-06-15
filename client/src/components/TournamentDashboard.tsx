import { useEffect, useMemo, useState } from "react";
import type { BracketRound, ChampionOddsResponse, Fixture, Forecast, TournamentSummary } from "../api/worldCupApi";
import { worldCupApi } from "../api/worldCupApi";
import { ChampionOddsTable } from "./ChampionOddsTable";
import { ForecastCard } from "./ForecastCard";
import { KnockoutBracket } from "./KnockoutBracket";

type DashboardTab = "overview" | "bracket" | "live";

const tabs: Array<{ id: DashboardTab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "bracket", label: "Knockout Bracket" },
  { id: "live", label: "Live Matches" }
];

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
  const [forecast, setForecast] = useState<Forecast>();
  const [error, setError] = useState<string>();
  const [activeTab, setActiveTab] = useState<DashboardTab>("overview");

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
      .catch(() => setForecast(undefined));
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

        <nav
          aria-label="Dashboard sections"
          className="sticky top-0 z-10 flex gap-2 overflow-x-auto rounded-lg border border-slate-200 bg-white/90 p-1 shadow-sm backdrop-blur"
        >
          {tabs.map((tab) => (
            <button
              key={tab.id}
              aria-selected={activeTab === tab.id}
              className={`min-h-10 flex-1 whitespace-nowrap rounded-md px-4 text-sm font-semibold transition ${
                activeTab === tab.id ? "bg-pitch text-white" : "text-slate-600 hover:bg-slate-100 hover:text-ink"
              }`}
              type="button"
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        {activeTab === "overview" ? (
          <div className="grid gap-5 lg:grid-cols-2">
            <ForecastCard fixture={upcomingFixture} forecast={forecast} />
            <ChampionOddsTable odds={odds} />
          </div>
        ) : null}

        {activeTab === "bracket" ? <KnockoutBracket rounds={bracket} /> : null}

        {activeTab === "live" ? (
          <section className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold">Live Matches</h2>
              <span className="text-xs font-medium text-slate-500">{liveScores.length} matches</span>
            </div>

            {liveScores.length ? (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {liveScores.map((fixture) => (
                  <article key={fixture.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <div className="mb-2 text-xs font-medium text-slate-500">
                      {fixture.state?.short_name ?? fixture.state?.name ?? "Live"}
                    </div>
                    <div className="text-sm font-semibold text-ink">{fixture.name}</div>
                  </article>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-600">Live matches will appear here when games are in progress.</p>
            )}
          </section>
        ) : null}
      </div>
    </main>
  );
}
