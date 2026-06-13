import type { ChampionOddsResponse } from "../api/worldCupApi";

type ChampionOddsTableProps = {
  odds?: ChampionOddsResponse;
};

function flattenOutrights(odds?: ChampionOddsResponse) {
  const rows = new Map<string, { team: string; bestPrice: number; bookmaker: string }>();

  for (const event of odds?.data ?? []) {
    for (const bookmaker of event.bookmakers ?? []) {
      for (const market of bookmaker.markets ?? []) {
        if (market.key !== "outrights") {
          continue;
        }

        for (const outcome of market.outcomes ?? []) {
          const current = rows.get(outcome.name);
          if (!current || outcome.price > current.bestPrice) {
            rows.set(outcome.name, {
              team: outcome.name,
              bestPrice: outcome.price,
              bookmaker: bookmaker.title
            });
          }
        }
      }
    }
  }

  return [...rows.values()].sort((a, b) => a.bestPrice - b.bestPrice);
}

export function ChampionOddsTable({ odds }: ChampionOddsTableProps) {
  const rows = flattenOutrights(odds).slice(0, 12);

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">Champion Odds</h2>
        <span className="text-xs font-medium text-slate-500">{odds?.provider ?? "odds provider"}</span>
      </div>

      {rows.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-80 text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="py-2 font-semibold">Team</th>
                <th className="py-2 font-semibold">Best Price</th>
                <th className="py-2 font-semibold">Book</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => (
                <tr key={row.team}>
                  <td className="py-2 font-medium">{row.team}</td>
                  <td className="py-2 tabular-nums">{row.bestPrice.toFixed(2)}</td>
                  <td className="py-2 text-slate-600">{row.bookmaker}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-slate-600">
          Champion odds need an outright odds feed and a configured odds API key.
        </p>
      )}
    </section>
  );
}
