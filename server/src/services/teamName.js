const aliases = new Map([
  ["usa", "united states"],
  ["us", "united states"],
  ["united states of america", "united states"],
  ["ivory coast", "cote divoire"],
  ["cote d'ivoire", "cote divoire"],
  ["cote d’ivoire", "cote divoire"],
  ["curaçao", "curacao"],
  ["bosnia-herzegovina", "bosnia and herzegovina"],
  ["cape verde islands", "cape verde"],
  ["congo dr", "dr congo"],
  ["democratic republic of congo", "dr congo"],
  ["drc", "dr congo"],
  ["korea republic", "south korea"],
  ["republic of korea", "south korea"]
]);

export function canonicalTeamName(name) {
  const normalized = String(name ?? "")
    .toLowerCase()
    .replace(/ fc$| cf$/g, "")
    .replaceAll(".", "")
    .replaceAll("’", "'")
    .trim();

  const aliased = aliases.get(normalized) ?? normalized;

  return [...aliased].filter((character) => /[a-z0-9 ]/.test(character)).join("").trim();
}

export function matchKey(homeTeam, awayTeam) {
  return [canonicalTeamName(homeTeam), canonicalTeamName(awayTeam)].sort().join(" v ");
}

export function sameTeams(left, right) {
  return canonicalTeamName(left) === canonicalTeamName(right);
}
