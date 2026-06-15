import type { Fixture, Forecast } from "../api/worldCupApi";

type ForecastCardProps = {
  fixture?: Fixture;
  forecast?: Forecast;
};

function formatProbability(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return "Pending";
  }

  return `${value.toFixed(1)}%`;
}

function labelForConfidence(value: string | undefined) {
  switch (value) {
    case "strong":
      return "Strong edge";
    case "balanced":
      return "Balanced";
    case "tight":
      return "Tight";
    default:
      return "Pending";
  }
}

function labelForAgreement(value: string | undefined) {
  switch (value) {
    case "aligned":
      return "Aligned";
    case "partial":
      return "Partial";
    case "split":
      return "Split";
    default:
      return "Pending";
  }
}

function providerAccent(id: string) {
  switch (id) {
    case "sportmonks":
      return "border-emerald-200 bg-emerald-50";
    case "api-football":
      return "border-sky-200 bg-sky-50";
    case "the-odds-api":
      return "border-amber-200 bg-amber-50";
    default:
      return "border-slate-200 bg-slate-50";
  }
}

export function ForecastCard({ fixture, forecast }: ForecastCardProps) {
  const headline = forecast?.fixture.name ?? fixture?.name ?? "Select an upcoming fixture";
  const consensus = forecast?.consensus;
  const providers = forecast?.providers ?? [];

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-4">
        <h2 className="text-base font-semibold">Match Forecast</h2>
        <p className="mt-1 text-sm text-slate-600">{headline}</p>
      </div>

      {forecast ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-4">
            <article className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Consensus Pick</p>
              <p className="mt-2 text-sm font-semibold text-ink">{consensus?.pick ?? "Pending"}</p>
              <p className="mt-1 text-xs text-slate-500">{consensus?.providerCount ?? 0} providers</p>
            </article>
            <article className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Confidence</p>
              <p className="mt-2 text-sm font-semibold text-ink">{labelForConfidence(consensus?.confidence)}</p>
              <p className="mt-1 text-xs text-slate-500">
                {formatProbability(consensus?.probabilities.homeWin)} home win
              </p>
            </article>
            <article className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Draw Risk</p>
              <p className="mt-2 text-sm font-semibold text-ink">{formatProbability(consensus?.probabilities.draw)}</p>
              <p className="mt-1 text-xs text-slate-500">Consensus draw probability</p>
            </article>
            <article className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Agreement</p>
              <p className="mt-2 text-sm font-semibold text-ink">{labelForAgreement(consensus?.agreement)}</p>
              <p className="mt-1 text-xs text-slate-500">Across all configured providers</p>
            </article>
          </div>

          <div className="overflow-hidden rounded-full bg-slate-100">
            <div className="flex h-3">
              <span className="bg-emerald-600" style={{ width: `${consensus?.probabilities.homeWin ?? 0}%` }} />
              <span className="bg-amber-400" style={{ width: `${consensus?.probabilities.draw ?? 0}%` }} />
              <span className="bg-sky-500" style={{ width: `${consensus?.probabilities.awayWin ?? 0}%` }} />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <article className="rounded-lg border border-slate-200 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {forecast.fixture.homeTeam}
              </p>
              <p className="mt-2 text-lg font-bold text-ink">{formatProbability(consensus?.probabilities.homeWin)}</p>
            </article>
            <article className="rounded-lg border border-slate-200 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Draw</p>
              <p className="mt-2 text-lg font-bold text-ink">{formatProbability(consensus?.probabilities.draw)}</p>
            </article>
            <article className="rounded-lg border border-slate-200 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {forecast.fixture.awayTeam}
              </p>
              <p className="mt-2 text-lg font-bold text-ink">{formatProbability(consensus?.probabilities.awayWin)}</p>
            </article>
          </div>

          <div className="grid gap-3">
            {providers.map((provider) => (
              <article key={provider.id} className={`rounded-lg border p-3 ${providerAccent(provider.id)}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-ink">{provider.name}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {provider.pick ? `Pick: ${provider.pick}` : provider.message ?? "Pending"}
                    </p>
                  </div>
                  <span className="rounded-full bg-white px-2 py-1 text-xs font-semibold text-slate-600">
                    {labelForConfidence(provider.confidence)}
                  </span>
                </div>

                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  <div className="rounded-md bg-white/80 p-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      {forecast.fixture.homeTeam}
                    </p>
                    <p className="mt-1 text-sm font-semibold text-ink">{formatProbability(provider.probabilities.homeWin)}</p>
                  </div>
                  <div className="rounded-md bg-white/80 p-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Draw</p>
                    <p className="mt-1 text-sm font-semibold text-ink">{formatProbability(provider.probabilities.draw)}</p>
                  </div>
                  <div className="rounded-md bg-white/80 p-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      {forecast.fixture.awayTeam}
                    </p>
                    <p className="mt-1 text-sm font-semibold text-ink">{formatProbability(provider.probabilities.awayWin)}</p>
                  </div>
                </div>

                {provider.advice || provider.market || provider.bookmakers ? (
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-600">
                    {provider.market ? <span className="rounded-full bg-white px-2 py-1">{provider.market}</span> : null}
                    {provider.advice ? <span className="rounded-full bg-white px-2 py-1">{provider.advice}</span> : null}
                    {provider.bookmakers ? (
                      <span className="rounded-full bg-white px-2 py-1">{provider.bookmakers} books</span>
                    ) : null}
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-sm text-slate-600">Win probabilities will appear when the provider has predictions for this fixture.</p>
      )}
    </section>
  );
}
