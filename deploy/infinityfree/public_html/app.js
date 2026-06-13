const refreshMs = 15000;
let refreshTimer;
let currentDashboard;
let selectedGroup = "all";
let selectedForecastIndex = 0;
let selectedMatchStatus = "all";

const countryFlags = {
  Algeria: "🇩🇿",
  Argentina: "🇦🇷",
  Australia: "🇦🇺",
  Austria: "🇦🇹",
  Belgium: "🇧🇪",
  "Bosnia and Herzegovina": "🇧🇦",
  "Bosnia-Herzegovina": "🇧🇦",
  Brazil: "🇧🇷",
  Canada: "🇨🇦",
  "Cape Verde": "🇨🇻",
  Colombia: "🇨🇴",
  "Cote d'Ivoire": "🇨🇮",
  "Côte d’Ivoire": "🇨🇮",
  Croatia: "🇭🇷",
  Curacao: "🇨🇼",
  Curaçao: "🇨🇼",
  Czechia: "🇨🇿",
  Denmark: "🇩🇰",
  "DR Congo": "🇨🇩",
  Ecuador: "🇪🇨",
  Egypt: "🇪🇬",
  England: "🏴",
  France: "🇫🇷",
  Germany: "🇩🇪",
  Ghana: "🇬🇭",
  Haiti: "🇭🇹",
  Iraq: "🇮🇶",
  Iran: "🇮🇷",
  Japan: "🇯🇵",
  Jordan: "🇯🇴",
  Mexico: "🇲🇽",
  Morocco: "🇲🇦",
  Netherlands: "🇳🇱",
  "New Zealand": "🇳🇿",
  Norway: "🇳🇴",
  Panama: "🇵🇦",
  Paraguay: "🇵🇾",
  Portugal: "🇵🇹",
  Qatar: "🇶🇦",
  "Saudi Arabia": "🇸🇦",
  Scotland: "🏴",
  Senegal: "🇸🇳",
  "South Africa": "🇿🇦",
  "South Korea": "🇰🇷",
  Spain: "🇪🇸",
  Switzerland: "🇨🇭",
  Sweden: "🇸🇪",
  Tunisia: "🇹🇳",
  Turkey: "🇹🇷",
  "United States": "🇺🇸",
  Uruguay: "🇺🇾",
  Uzbekistan: "🇺🇿"
};

const worldCupGroups = [
  ["Group A", ["Mexico", "South Africa", "South Korea", "Czechia"]],
  ["Group B", ["Canada", "Bosnia and Herzegovina", "Qatar", "Switzerland"]],
  ["Group C", ["Brazil", "Morocco", "Haiti", "Scotland"]],
  ["Group D", ["United States", "Paraguay", "Australia", "Turkey"]],
  ["Group E", ["Germany", "Cote d'Ivoire", "Ecuador", "Curacao"]],
  ["Group F", ["Netherlands", "Japan", "Sweden", "Tunisia"]],
  ["Group G", ["Belgium", "Egypt", "Iran", "New Zealand"]],
  ["Group H", ["Spain", "Cape Verde", "Saudi Arabia", "Uruguay"]],
  ["Group I", ["France", "Senegal", "Iraq", "Norway"]],
  ["Group J", ["Argentina", "Algeria", "Austria", "Jordan"]],
  ["Group K", ["Portugal", "Colombia", "Uzbekistan", "DR Congo"]],
  ["Group L", ["England", "Croatia", "Ghana", "Panama"]]
];

function sampleTeamRow(team, index) {
  const played = 0;
  const won = 0;
  const drawn = 0;
  const lost = 0;
  const goalsFor = 0;
  const goalsAgainst = 0;
  const points = 0;
  return { team, played, won, drawn, lost, goalsFor, goalsAgainst, points };
}

function sampleGroups() {
  return worldCupGroups.map(([name, teams]) => ({
    name,
    teams: teams.map((team, index) => sampleTeamRow(team, index))
  }));
}

function sampleBracket() {
  const roundOf32 = [
    ["Winner Group A", "3rd C/E/F/H/I"],
    ["Winner Group C", "3rd A/B/F/H/I"],
    ["Winner Group E", "3rd A/B/C/D/F"],
    ["Winner Group G", "3rd A/E/H/I/J"],
    ["Winner Group I", "3rd C/D/F/G/H"],
    ["Winner Group J", "3rd B/E/F/I/J"],
    ["Winner Group K", "3rd D/E/I/J/L"],
    ["Winner Group L", "3rd E/H/I/J/K"],
    ["Winner Group B", "3rd E/F/G/I/J"],
    ["Winner Group D", "3rd B/E/F/I/J"],
    ["Winner Group F", "Runner-up Group C"],
    ["Winner Group H", "Runner-up Group J"],
    ["Runner-up Group A", "Runner-up Group B"],
    ["Runner-up Group D", "Runner-up Group G"],
    ["Runner-up Group E", "Runner-up Group I"],
    ["Runner-up Group K", "Runner-up Group L"]
  ];

  return [
    {
      round: "Round of 32",
      matches: roundOf32.map(([home, away]) => ({ home, away, score: "TBD", status: "Seeded", winner: "" }))
    },
    {
      round: "Round of 16",
      matches: Array.from({ length: 8 }, (_, index) => ({
        home: `R32 Winner ${index * 2 + 1}`,
        away: `R32 Winner ${index * 2 + 2}`,
        score: "TBD",
        status: "Pending",
        winner: ""
      }))
    },
    {
      round: "Quarter Finals",
      matches: Array.from({ length: 4 }, (_, index) => ({
        home: `R16 Winner ${index * 2 + 1}`,
        away: `R16 Winner ${index * 2 + 2}`,
        score: "TBD",
        status: "Pending",
        winner: ""
      }))
    },
    {
      round: "Semi Finals",
      matches: Array.from({ length: 2 }, (_, index) => ({
        home: `QF Winner ${index * 2 + 1}`,
        away: `QF Winner ${index * 2 + 2}`,
        score: "TBD",
        status: "Pending",
        winner: ""
      }))
    },
    {
      round: "Final",
      matches: [{ home: "Semi-final Winner 1", away: "Semi-final Winner 2", score: "TBD", status: "Pending", winner: "" }]
    }
  ];
}

const sampleDashboard = {
  mode: "sample",
  updatedAt: new Date().toISOString(),
  message: "Actual standings are shown only from the live API. Sample mode keeps tables at zero until FOOTBALL_DATA_TOKEN or Sportmonks credentials are configured.",
  setupRequired: true,
  missingConfig: ["FOOTBALL_DATA_TOKEN"],
  groups: sampleGroups(),
  results: [
    { home: "Mexico", away: "South Africa", score: "Upcoming", status: "Group A" },
    { home: "Canada", away: "Qatar", score: "Upcoming", status: "Group B" },
    { home: "Brazil", away: "Morocco", score: "Upcoming", status: "Group C" },
    { home: "United States", away: "Paraguay", score: "Upcoming", status: "Group D" },
    { home: "Germany", away: "Cote d'Ivoire", score: "Upcoming", status: "Group E" },
    { home: "Spain", away: "Cape Verde", score: "Upcoming", status: "Group H" }
  ],
  allMatches: [],
  bracket: sampleBracket(),
  forecasts: [
    { match: "Mexico vs Argentina", home: "Mexico", away: "Argentina", homeWin: 27, draw: 24, awayWin: 49 },
    { match: "Brazil vs Germany", home: "Brazil", away: "Germany", homeWin: 43, draw: 25, awayWin: 32 },
    { match: "France vs Portugal", home: "France", away: "Portugal", homeWin: 39, draw: 28, awayWin: 33 }
  ],
  championOdds: [
    { team: "Argentina", odds: 5.5, source: "Power Rank" },
    { team: "France", odds: 6.0, source: "Power Rank" },
    { team: "Brazil", odds: 7.0, source: "Power Rank" },
    { team: "England", odds: 8.5, source: "Power Rank" },
    { team: "Spain", odds: 9.0, source: "Power Rank" },
    { team: "Portugal", odds: 10.0, source: "Power Rank" },
    { team: "Germany", odds: 11.0, source: "Power Rank" },
    { team: "Netherlands", odds: 13.0, source: "Power Rank" }
  ]
};

const elements = {
  modeLabel: document.getElementById("modeLabel"),
  refreshLabel: document.getElementById("refreshLabel"),
  updatedAt: document.getElementById("updatedAt"),
  groupCount: document.getElementById("groupCount"),
  roundCount: document.getElementById("roundCount"),
  forecastCount: document.getElementById("forecastCount"),
  message: document.getElementById("message"),
  standings: document.getElementById("standings"),
  bracket: document.getElementById("bracket"),
  results: document.getElementById("results"),
  allMatches: document.getElementById("allMatches"),
  matchStatusFilter: document.getElementById("matchStatusFilter"),
  forecasts: document.getElementById("forecasts"),
  forecastSelect: document.getElementById("forecastSelect"),
  groupFilter: document.getElementById("groupFilter"),
  championOdds: document.getElementById("championOdds"),
  refreshButton: document.getElementById("refreshButton")
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function flagFor(teamName) {
  const cleanName = String(teamName ?? "")
    .replace(/^Winner Group [A-L]$/, "")
    .replace(/^Runner-up Group [A-L]$/, "")
    .replace(/^3rd .+$/, "")
    .trim();

  if (!cleanName || cleanName.includes("Winner") || cleanName.includes("TBD")) {
    return "🏆";
  }

  if (cleanName.startsWith("Play-off Winner")) {
    return "🌐";
  }

  return countryFlags[cleanName] || "🌐";
}

function teamLabel(teamName, extraClass = "") {
  return `<span class="team-name ${extraClass}"><span class="flag">${flagFor(teamName)}</span><span>${escapeHtml(teamName)}</span></span>`;
}

function formatDate(value) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    month: "short",
    day: "numeric"
  }).format(new Date(value));
}

function formatKickoff(value) {
  if (!value) {
    return "";
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function syncGroupFilter(groups) {
  const currentValue = elements.groupFilter.value || selectedGroup;
  elements.groupFilter.innerHTML = [
    `<option value="all">All groups</option>`,
    ...groups.map((group) => `<option value="${escapeHtml(group.name)}">${escapeHtml(group.name)}</option>`)
  ].join("");

  const hasCurrent = currentValue === "all" || groups.some((group) => group.name === currentValue);
  selectedGroup = hasCurrent ? currentValue : "all";
  elements.groupFilter.value = selectedGroup;
}

function renderStandings(groups) {
  const visibleGroups = selectedGroup === "all" ? groups : groups.filter((group) => group.name === selectedGroup);

  elements.standings.innerHTML = visibleGroups
    .map(
      (group) => `
        <article class="group-card">
          <h3><span>${escapeHtml(group.name)}</span><small>Actual standings</small></h3>
          <table>
            <thead>
              <tr>
                <th>Team</th>
                <th class="number">P</th>
                <th class="number">W</th>
                <th class="number">D</th>
                <th class="number">L</th>
                <th class="number">GD</th>
                <th class="number">Pts</th>
              </tr>
            </thead>
            <tbody>
              ${(group.teams || [])
                .map((team, index) => {
                  const gd = Number(team.goalsFor || 0) - Number(team.goalsAgainst || 0);
                  return `
                    <tr class="${index < 2 ? "qualifier-row" : ""}">
                      <td>
                        <span class="rank-badge">${index + 1}</span>
                        <strong>${teamLabel(team.team)}</strong>
                      </td>
                      <td class="number">${escapeHtml(team.played)}</td>
                      <td class="number">${escapeHtml(team.won)}</td>
                      <td class="number">${escapeHtml(team.drawn)}</td>
                      <td class="number">${escapeHtml(team.lost)}</td>
                      <td class="number">${gd > 0 ? "+" : ""}${gd}</td>
                      <td class="number"><strong>${escapeHtml(team.points)}</strong></td>
                    </tr>
                  `;
                })
                .join("")}
            </tbody>
          </table>
        </article>
      `
    )
    .join("");
}

function renderBracket(rounds) {
  if (!rounds.length) {
    elements.bracket.innerHTML = `<p class="empty-note">Knockout fixtures will appear when the provider publishes the bracket.</p>`;
    return;
  }

  elements.bracket.innerHTML = rounds
    .map((round, roundIndex) => {
      const matches = round.matches || [];
      const roundGap = roundIndex === 0 ? 12 : Math.min(96 * Math.pow(2, roundIndex - 1), 520);
      const roundOffset = roundIndex === 0 ? 0 : Math.min(58 * Math.pow(2, roundIndex - 1), 520);

      return `
        <article class="bracket-round" style="--round-gap: ${roundGap}px; --round-offset: ${roundOffset}px;">
          <h3>${escapeHtml(round.round)}</h3>
          <div class="bracket-round-stack">
          ${(round.matches || [])
            .map(
              (match, matchIndex) => `
                <div class="bracket-match-card" data-match="${matchIndex + 1}">
                  <div class="bracket-match-meta">
                    <span>${escapeHtml(match.status || "Pending")}</span>
                    <span>${escapeHtml(match.score || "TBD")}</span>
                  </div>
                  <div class="bracket-team-line ${match.winner === match.home ? "winner" : ""}">
                    ${teamLabel(match.home)}
                  </div>
                  <div class="bracket-team-line ${match.winner === match.away ? "winner" : ""}">
                    ${teamLabel(match.away)}
                  </div>
                  <div class="bracket-match-footer">${match.winner ? `Winner: ${escapeHtml(match.winner)}` : "Awaiting result"}</div>
                </div>
              `
            )
            .join("")}
          </div>
        </article>
      `;
    })
    .join("");
}

function renderResults(results) {
  elements.results.innerHTML = results
    .map(
      (result) => `
        <article class="result-card">
          <span class="status-pill">${escapeHtml(result.status)}</span>
          <strong>${escapeHtml(result.score)}</strong>
          <div class="result-teams">${teamLabel(result.home)}<span>vs</span>${teamLabel(result.away)}</div>
        </article>
      `
    )
    .join("");
}

function statusBucket(status) {
  if (["FINISHED", "AWARDED"].includes(status)) {
    return "finished";
  }
  if (["IN_PLAY", "PAUSED"].includes(status)) {
    return "live";
  }
  return "upcoming";
}

function renderAllMatches(matches) {
  if (!matches.length) {
    elements.allMatches.innerHTML = `<p class="empty-note">Match schedule will appear when the provider returns it.</p>`;
    return;
  }

  const visibleMatches =
    selectedMatchStatus === "all"
      ? matches
      : matches.filter((match) => statusBucket(match.status) === selectedMatchStatus);

  elements.allMatches.innerHTML = `
    <table class="match-table">
      <thead>
        <tr>
          <th>Date</th>
          <th>Stage</th>
          <th>Match</th>
          <th>Status</th>
          <th class="number">Score</th>
        </tr>
      </thead>
      <tbody>
        ${visibleMatches
          .map(
            (match) => `
              <tr>
                <td>${escapeHtml(formatKickoff(match.kickoff) || "-")}</td>
                <td>
                  <span class="stage-label">${escapeHtml(match.group || match.stage || "-")}</span>
                </td>
                <td>
                  <div class="matchup-line">
                    ${teamLabel(match.home)}
                    <span>vs</span>
                    ${teamLabel(match.away)}
                  </div>
                </td>
                <td><span class="status-pill">${escapeHtml(match.status || "-")}</span></td>
                <td class="number"><strong>${escapeHtml(match.score || "-")}</strong></td>
              </tr>
            `
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function renderForecasts(forecasts) {
  if (!forecasts.length) {
    elements.forecastSelect.innerHTML = `<option>No forecast available</option>`;
    elements.forecasts.innerHTML = `<p class="empty-note">Prediction data will appear when the provider has upcoming match probabilities.</p>`;
    return;
  }

  if (selectedForecastIndex >= forecasts.length) {
    selectedForecastIndex = 0;
  }

  elements.forecastSelect.innerHTML = forecasts
    .map((forecast, index) => `<option value="${index}">${escapeHtml(forecast.match)}</option>`)
    .join("");
  elements.forecastSelect.value = String(selectedForecastIndex);

  const forecast = forecasts[selectedForecastIndex];
  const hasProbabilities =
    forecast.homeWin !== null &&
    forecast.homeWin !== undefined &&
    forecast.draw !== null &&
    forecast.draw !== undefined &&
    forecast.awayWin !== null &&
    forecast.awayWin !== undefined;

  elements.forecasts.innerHTML = `
    <article class="forecast-card forecast-card-featured">
      <div class="forecast-head">
        <span>${escapeHtml(forecast.match)}</span>
        <span class="probability-chip">${hasProbabilities ? `${escapeHtml(forecast.homeWin)}%` : "Fixture"}</span>
      </div>
      <div class="forecast-meta">
        <span>${escapeHtml(forecast.status || "Upcoming")}</span>
        ${forecast.kickoff ? `<span>${escapeHtml(formatKickoff(forecast.kickoff))}</span>` : ""}
        <span>${escapeHtml(forecast.source || "fixture")}</span>
      </div>
      ${
        hasProbabilities
          ? `
            <div class="bar"><div class="bar-fill" style="width: ${Number(forecast.homeWin || 0)}%"></div></div>
            <div class="forecast-grid">
              <span>${teamLabel(forecast.home)} ${escapeHtml(forecast.homeWin)}%</span>
              <span>Draw ${escapeHtml(forecast.draw)}%</span>
              <span>${teamLabel(forecast.away)} ${escapeHtml(forecast.awayWin)}%</span>
            </div>
          `
          : `
            <div class="prediction-empty">
              <strong>Prediction not configured</strong>
              <span>${escapeHtml(forecast.predictionStatus || "Add a prediction provider token to show real probabilities.")}</span>
            </div>
          `
      }
    </article>
  `;
}

function renderChampionOdds(rows) {
  elements.championOdds.innerHTML = rows
    .map(
      (row) => `
        <div class="odds-row">
          <span><b>${teamLabel(row.team)}</b><small>${escapeHtml(row.source || "Market")}</small></span>
          <strong>${Number(row.odds || 0).toFixed(2)}</strong>
        </div>
      `
    )
    .join("");
}

function renderDashboard(data) {
  currentDashboard = data;
  elements.modeLabel.textContent = data.mode === "live" ? "Live API mode" : "Sample mode";
  elements.updatedAt.textContent = formatDate(data.updatedAt);
  elements.groupCount.textContent = data.groups?.length ?? 0;
  elements.roundCount.textContent = data.bracket?.length ?? 0;
  elements.forecastCount.textContent = data.forecasts?.length ?? 0;
  if (data.setupRequired) {
    elements.message.innerHTML = `
      <strong>Live API setup needed.</strong>
      Add ${escapeHtml((data.missingConfig || []).join(" and "))} in <code>.env</code>, then restart the local server.
      The page is showing zeroed sample tables until live data is configured.
    `;
  } else if (data.error) {
    elements.message.innerHTML = `
      <strong>Live API request failed.</strong>
      ${escapeHtml(data.message || "")}
      <span>Provider note: ${escapeHtml(data.error)}</span>
    `;
  } else {
    elements.message.textContent = data.message || "";
  }
  elements.message.classList.toggle("error", Boolean(data.error));
  elements.message.classList.toggle("setup-note", Boolean(data.setupRequired));

  syncGroupFilter(data.groups || []);
  renderStandings(data.groups || []);
  renderBracket(data.bracket || []);
  renderResults(data.results || []);
  renderAllMatches(data.allMatches || []);
  renderForecasts(data.forecasts || []);
  renderChampionOdds(data.championOdds || []);
}

async function loadDashboard() {
  elements.refreshLabel.textContent = "Refreshing...";

  try {
    if (window.location.protocol === "file:") {
      renderDashboard({
        ...sampleDashboard,
        updatedAt: new Date().toISOString()
      });
      return;
    }

    const response = await fetch("api/dashboard", { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Dashboard API returned ${response.status}`);
    }
    const data = await response.json();
    renderDashboard(data);
  } catch (error) {
    renderDashboard({
      ...sampleDashboard,
      updatedAt: new Date().toISOString(),
      error: `Could not refresh dashboard: ${error.message}`
    });
  } finally {
    elements.refreshLabel.textContent = "Auto refresh: 15s";
  }
}

function startAutoRefresh() {
  clearInterval(refreshTimer);
  refreshTimer = setInterval(loadDashboard, refreshMs);
}

elements.refreshButton.addEventListener("click", loadDashboard);
elements.groupFilter.addEventListener("change", (event) => {
  selectedGroup = event.target.value;
  renderStandings(currentDashboard?.groups || []);
});
elements.forecastSelect.addEventListener("change", (event) => {
  selectedForecastIndex = Number(event.target.value || 0);
  renderForecasts(currentDashboard?.forecasts || []);
});
elements.matchStatusFilter.addEventListener("change", (event) => {
  selectedMatchStatus = event.target.value;
  renderAllMatches(currentDashboard?.allMatches || []);
});
loadDashboard();
startAutoRefresh();
