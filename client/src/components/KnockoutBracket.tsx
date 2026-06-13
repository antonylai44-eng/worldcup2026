import type { BracketRound, Fixture, TeamParticipant } from "../api/worldCupApi";

type KnockoutBracketProps = {
  rounds: BracketRound[];
};

function scoreFor(fixture: Fixture, team: TeamParticipant) {
  const score = fixture.scores.find((item) => item.participant_id === team.id);
  return score?.score?.goals ?? "-";
}

export function KnockoutBracket({ rounds }: KnockoutBracketProps) {
  if (!rounds.length) {
    return (
      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-base font-semibold">Knockout Bracket</h2>
        <p className="mt-3 text-sm text-slate-600">Bracket fixtures will populate when knockout schedules are available.</p>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">Knockout Bracket</h2>
        <span className="text-xs font-medium text-slate-500">{rounds.length} rounds</span>
      </div>

      <div className="grid gap-4 overflow-x-auto md:grid-flow-col md:auto-cols-[minmax(240px,1fr)]">
        {rounds.map((round) => (
          <div key={`${round.stageId}-${round.roundId}-${round.scheduleId}`} className="min-w-60">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              {round.roundName ?? round.stageName ?? "Knockout"}
            </div>
            <div className="space-y-3">
              {round.fixtures.map((fixture) => (
                <button
                  key={fixture.id}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 p-3 text-left transition hover:border-pitch hover:bg-white focus:outline-none focus:ring-2 focus:ring-pitch"
                  type="button"
                >
                  <div className="mb-2 text-xs text-slate-500">{fixture.state?.short_name ?? fixture.state?.name ?? "Scheduled"}</div>
                  <div className="space-y-1">
                    {fixture.participants.slice(0, 2).map((team) => (
                      <div key={team.id} className="flex items-center justify-between gap-3 text-sm">
                        <span className={team.meta?.winner ? "font-semibold text-pitch" : "font-medium"}>
                          {team.name}
                        </span>
                        <span className="tabular-nums">{scoreFor(fixture, team)}</span>
                      </div>
                    ))}
                  </div>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
