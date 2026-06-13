import type { Fixture } from "../api/worldCupApi";

type ForecastCardProps = {
  fixture?: Fixture;
  forecast?: Array<{
    type?: {
      name?: string;
      code?: string;
    };
    predictions?: Array<{
      value?: string | number;
      probability?: string | number;
    }>;
  }>;
};

function formatProbability(value: string | number | undefined) {
  if (value === undefined) {
    return "Pending";
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? `${numeric.toFixed(1)}%` : String(value);
}

export function ForecastCard({ fixture, forecast = [] }: ForecastCardProps) {
  const winMarket = forecast.find((item) => /winner|fulltime|1x2/i.test(`${item.type?.name} ${item.type?.code}`));
  const predictions = winMarket?.predictions ?? [];

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-4">
        <h2 className="text-base font-semibold">Match Forecast</h2>
        <p className="mt-1 text-sm text-slate-600">{fixture?.name ?? "Select an upcoming fixture"}</p>
      </div>

      <div className="space-y-3">
        {predictions.length ? (
          predictions.map((prediction, index) => (
            <div key={`${prediction.value}-${index}`} className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium text-slate-700">{prediction.value}</span>
              <span className="rounded-md bg-pitch px-2 py-1 text-sm font-semibold text-white">
                {formatProbability(prediction.probability)}
              </span>
            </div>
          ))
        ) : (
          <p className="text-sm text-slate-600">Win probabilities will appear when the provider has predictions for this fixture.</p>
        )}
      </div>
    </section>
  );
}
