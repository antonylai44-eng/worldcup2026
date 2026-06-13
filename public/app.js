const refreshMs = 15000;
let refreshTimer;
let currentDashboard;
let selectedGroup = "all";
let selectedForecastIndex = 0;
let selectedMatchStatus = "all";
let currentLanguage = localStorage.getItem("dashboardLanguage") || "en";

const translations = {
  en: {
    allGroups: "All groups",
    allMatches: "All matches",
    actualGroupTables: "Actual Group Tables",
    awaitingResult: "Awaiting result",
    autoRefresh: "Auto refresh: 15s",
    championOdds: "Champion Odds",
    date: "Date",
    draw: "Draw",
    eloRefreshFailed: "Elo refresh failed.",
    eyebrow: "2026 FIFA World Cup",
    finished: "Finished",
    fixture: "Fixture",
    forecastMatches: "Forecast matches",
    fullSchedule: "Full Schedule",
    gamesPlayed: "P",
    goalDifference: "GD",
    groups: "Groups",
    groupStage: "Group Stage",
    heroSubtitle: "Live tables, knockout paths, match probabilities, and champion outlook in one matchday view.",
    heroTitle: "Prediction Dashboard",
    kickoffFormula: "Expected score formula",
    knockoutBracket: "Knockout Bracket",
    knockoutRounds: "Knockout rounds",
    lastUpdate: "Last update",
    latestResults: "Latest Results",
    losses: "L",
    live: "Live",
    liveApiMode: "Live API mode",
    liveApiRequestFailed: "Live API request failed.",
    market: "Market",
    match: "Match",
    matchCentre: "Match Centre",
    matchForecast: "Match Forecast",
    matchScheduleMessage: "Match schedule will appear when the provider returns it.",
    noForecast: "No forecast available",
    noForecastMessage: "Prediction data will appear when the provider has upcoming match probabilities.",
    noClearEdge: "No clear edge",
    noEdge: "No edge",
    oddsNotRefreshed: "Odds probability not refreshed",
    pending: "Pending",
    playedDrawn: "D",
    points: "Pts",
    prediction: "Prediction",
    predictionNotConfigured: "Prediction not configured",
    providerNote: "Provider note",
    refreshElo: "Refresh Elo",
    refreshing: "Refreshing...",
    refreshNow: "Refresh Now",
    roadToFinal: "Road to the Final",
    sampleMode: "Sample mode",
    score: "Score",
    scrollPath: "Scroll to follow the path",
    selectMatch: "Select match",
    seeded: "Seeded",
    setupNeeded: "Live API setup needed.",
    setupText: "Add {keys} in .env, then restart the local server. The page is showing zeroed sample tables until live data is configured.",
    sheetConsensus: "Sheet consensus",
    show: "Show",
    stage: "Stage",
    status: "Status",
    team: "Team",
    tournament: "Tournament",
    upcoming: "Upcoming",
    vs: "vs",
    winner: "Winner",
    wins: "W",
    worldFootballElo: "World Football Elo"
  },
  zh: {
    allGroups: "所有分組",
    allMatches: "所有賽事",
    actualGroupTables: "實時分組積分榜",
    awaitingResult: "等待賽果",
    autoRefresh: "自動更新：15秒",
    championOdds: "冠軍賠率",
    date: "日期",
    draw: "和局",
    eloRefreshFailed: "Elo 更新失敗。",
    eyebrow: "2026 FIFA 世界盃",
    finished: "已完場",
    fixture: "賽程",
    forecastMatches: "預測賽事",
    fullSchedule: "完整賽程",
    gamesPlayed: "賽",
    goalDifference: "得失",
    groups: "分組",
    groupStage: "分組賽",
    heroSubtitle: "即時積分榜、淘汰賽走線、賽事預測及冠軍走勢集中顯示。",
    heroTitle: "賽事預測儀表板",
    kickoffFormula: "預期得分公式",
    knockoutBracket: "淘汰賽表",
    knockoutRounds: "淘汰賽輪次",
    lastUpdate: "最後更新",
    latestResults: "最新賽果",
    losses: "負",
    live: "直播中",
    liveApiMode: "即時 API 模式",
    liveApiRequestFailed: "即時 API 請求失敗。",
    market: "市場",
    match: "賽事",
    matchCentre: "賽事中心",
    matchForecast: "賽事預測",
    matchScheduleMessage: "資料來源回傳賽程後，會在此顯示。",
    noForecast: "沒有可用預測",
    noForecastMessage: "當資料來源提供即將比賽的預測時，會在此顯示。",
    noClearEdge: "未有明顯優勢",
    noEdge: "未有優勢",
    oddsNotRefreshed: "賠率機率尚未更新",
    pending: "待定",
    playedDrawn: "和",
    points: "分",
    prediction: "預測",
    predictionNotConfigured: "預測尚未設定",
    providerNote: "資料來源訊息",
    refreshElo: "更新 Elo",
    refreshing: "更新中...",
    refreshNow: "立即更新",
    roadToFinal: "晉級之路",
    sampleMode: "範例模式",
    score: "比分",
    scrollPath: "左右捲動查看走線",
    selectMatch: "選擇賽事",
    seeded: "種子席位",
    setupNeeded: "需要設定即時 API。",
    setupText: "請在 .env 加入 {keys}，然後重新啟動本機伺服器。未連接即時資料前，頁面會顯示歸零的範例積分榜。",
    sheetConsensus: "試算表共識",
    show: "顯示",
    stage: "階段",
    status: "狀態",
    team: "球隊",
    tournament: "賽事",
    upcoming: "未開賽",
    vs: "對",
    winner: "勝方",
    wins: "勝",
    worldFootballElo: "世界足球 Elo"
  }
};

function t(key) {
  return translations[currentLanguage]?.[key] || translations.en[key] || key;
}

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

const zhTeamNames = {
  Algeria: "阿爾及利亞",
  Argentina: "阿根廷",
  Australia: "澳洲",
  Austria: "奧地利",
  Belgium: "比利時",
  "Bosnia and Herzegovina": "波斯尼亞和黑塞哥維那",
  "Bosnia-Herzegovina": "波斯尼亞和黑塞哥維那",
  Brazil: "巴西",
  Canada: "加拿大",
  "Cape Verde": "佛得角",
  Colombia: "哥倫比亞",
  "Cote d'Ivoire": "科特迪瓦",
  "Côte d’Ivoire": "科特迪瓦",
  Croatia: "克羅地亞",
  Curacao: "庫拉索",
  Curaçao: "庫拉索",
  Czechia: "捷克",
  Denmark: "丹麥",
  "DR Congo": "剛果民主共和國",
  Ecuador: "厄瓜多爾",
  Egypt: "埃及",
  England: "英格蘭",
  France: "法國",
  Germany: "德國",
  Ghana: "加納",
  Haiti: "海地",
  Iraq: "伊拉克",
  Iran: "伊朗",
  Japan: "日本",
  Jordan: "約旦",
  Mexico: "墨西哥",
  Morocco: "摩洛哥",
  Netherlands: "荷蘭",
  "New Zealand": "新西蘭",
  Norway: "挪威",
  Panama: "巴拿馬",
  Paraguay: "巴拉圭",
  Portugal: "葡萄牙",
  Qatar: "卡塔爾",
  "Saudi Arabia": "沙特阿拉伯",
  Scotland: "蘇格蘭",
  Senegal: "塞內加爾",
  "South Africa": "南非",
  "South Korea": "南韓",
  Spain: "西班牙",
  Switzerland: "瑞士",
  Sweden: "瑞典",
  Tunisia: "突尼西亞",
  Turkey: "土耳其",
  "United States": "美國",
  Uruguay: "烏拉圭",
  Uzbekistan: "烏茲別克"
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
  refreshButton: document.getElementById("refreshButton"),
  refreshEloButton: document.getElementById("refreshEloButton"),
  langEn: document.getElementById("langEn"),
  langZh: document.getElementById("langZh")
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

function displayTeamName(teamName) {
  if (currentLanguage !== "zh") {
    return teamName;
  }

  const value = String(teamName ?? "");
  return zhTeamNames[value] || value;
}

function teamLabel(teamName, extraClass = "") {
  return `<span class="team-name ${extraClass}"><span class="flag">${flagFor(teamName)}</span><span>${escapeHtml(displayTeamName(teamName))}</span></span>`;
}

function displayMatchName(forecast) {
  if (forecast?.home && forecast?.away) {
    return `${displayTeamName(forecast.home)} ${t("vs")} ${displayTeamName(forecast.away)}`;
  }

  return forecast?.match || "";
}

function displaySource(source) {
  if (!source) {
    return t("fixture");
  }

  if (currentLanguage !== "zh") {
    return source;
  }

  const names = {
    fixture: t("fixture"),
    Fixture: t("fixture"),
    Market: t("market"),
    "Power Rank": "實力排名"
  };
  return names[source] || source;
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

function displayGroupName(groupName) {
  if (currentLanguage !== "zh") {
    return groupName;
  }

  return String(groupName ?? "").replace(/^Group ([A-L])$/, "小組 $1");
}

function displayRoundName(roundName) {
  if (currentLanguage !== "zh") {
    return roundName;
  }

  const names = {
    "Round of 32": "32 強",
    "Round of 16": "16 強",
    "Quarter Finals": "半準決賽",
    "Quarter-finals": "半準決賽",
    "Semi Finals": "準決賽",
    "Semi-finals": "準決賽",
    Final: "決賽"
  };
  return names[roundName] || roundName;
}

function displayStatus(status) {
  const value = String(status ?? "");
  if (currentLanguage !== "zh") {
    return value || "-";
  }

  const names = {
    AWARDED: "判定完場",
    FINISHED: "已完場",
    IN_PLAY: "進行中",
    LIVE: "直播中",
    PAUSED: "暫停",
    PENDING: t("pending"),
    Pending: t("pending"),
    POSTPONED: "延期",
    SCHEDULED: "未開賽",
    SEEDED: t("seeded"),
    Seeded: t("seeded"),
    TIMED: "已定時間",
    Upcoming: t("upcoming")
  };
  return names[value] || displayGroupName(value) || value || "-";
}

function displayStage(stage) {
  return displayRoundName(displayGroupName(stage || "-"));
}

function applyLanguage() {
  document.documentElement.lang = currentLanguage === "zh" ? "zh-Hant" : "en";
  document.title = `${t("eyebrow")} - ${t("heroTitle")}`;
  document.querySelectorAll("[data-i18n]").forEach((node) => {
    node.textContent = t(node.dataset.i18n);
  });
  syncMatchStatusFilter();
  elements.langEn.classList.toggle("active", currentLanguage === "en");
  elements.langZh.classList.toggle("active", currentLanguage === "zh");
  if (currentDashboard) {
    renderDashboard(currentDashboard);
  } else {
    elements.modeLabel.textContent = t("sampleMode");
    elements.refreshLabel.textContent = t("autoRefresh");
  }
}

function syncMatchStatusFilter() {
  const currentValue = elements.matchStatusFilter.value || selectedMatchStatus;
  elements.matchStatusFilter.innerHTML = `
    <option value="all">${t("allMatches")}</option>
    <option value="finished">${t("finished")}</option>
    <option value="upcoming">${t("upcoming")}</option>
    <option value="live">${t("live")}</option>
  `;
  selectedMatchStatus = currentValue;
  elements.matchStatusFilter.value = currentValue;
}

function setLanguage(language) {
  currentLanguage = language;
  localStorage.setItem("dashboardLanguage", language);
  applyLanguage();
}

function syncGroupFilter(groups) {
  const currentValue = elements.groupFilter.value || selectedGroup;
  elements.groupFilter.innerHTML = [
    `<option value="all">${t("allGroups")}</option>`,
    ...groups.map((group) => `<option value="${escapeHtml(group.name)}">${escapeHtml(displayGroupName(group.name))}</option>`)
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
          <h3><span>${escapeHtml(displayGroupName(group.name))}</span><small>${t("actualGroupTables")}</small></h3>
          <table>
            <thead>
              <tr>
                <th>${t("team")}</th>
                <th class="number">${t("gamesPlayed")}</th>
                <th class="number">${t("wins")}</th>
                <th class="number">${t("playedDrawn")}</th>
                <th class="number">${t("losses")}</th>
                <th class="number">${t("goalDifference")}</th>
                <th class="number">${t("points")}</th>
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
    elements.bracket.innerHTML = `<p class="empty-note">${t("noForecastMessage")}</p>`;
    return;
  }

  elements.bracket.innerHTML = rounds
    .map((round, roundIndex) => {
      const matches = round.matches || [];
      const roundGap = roundIndex === 0 ? 12 : Math.min(96 * Math.pow(2, roundIndex - 1), 520);
      const roundOffset = roundIndex === 0 ? 0 : Math.min(58 * Math.pow(2, roundIndex - 1), 520);

      return `
        <article class="bracket-round" style="--round-gap: ${roundGap}px; --round-offset: ${roundOffset}px;">
          <h3>${escapeHtml(displayRoundName(round.round))}</h3>
          <div class="bracket-round-stack">
          ${(round.matches || [])
            .map(
              (match, matchIndex) => `
                <div class="bracket-match-card" data-match="${matchIndex + 1}">
                  <div class="bracket-match-meta">
                    <span>${escapeHtml(displayStatus(match.status || "Pending"))}</span>
                    <span>${escapeHtml(match.score || "TBD")}</span>
                  </div>
                  <div class="bracket-team-line ${match.winner === match.home ? "winner" : ""}">
                    ${teamLabel(match.home)}
                  </div>
                  <div class="bracket-team-line ${match.winner === match.away ? "winner" : ""}">
                    ${teamLabel(match.away)}
                  </div>
                  <div class="bracket-match-footer">${match.winner ? `${t("winner")}: ${escapeHtml(displayTeamName(match.winner))}` : t("awaitingResult")}</div>
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
          <span class="status-pill">${escapeHtml(displayStatus(result.status))}</span>
          <strong>${escapeHtml(result.score)}</strong>
          <div class="result-teams">${teamLabel(result.home)}<span>${t("vs")}</span>${teamLabel(result.away)}</div>
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
    elements.allMatches.innerHTML = `<p class="empty-note">${t("matchScheduleMessage")}</p>`;
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
          <th>${t("date")}</th>
          <th>${t("stage")}</th>
          <th>${t("match")}</th>
          <th>${t("status")}</th>
          <th class="number">${t("score")}</th>
        </tr>
      </thead>
      <tbody>
        ${visibleMatches
          .map(
            (match) => `
              <tr>
                <td>${escapeHtml(formatKickoff(match.kickoff) || "-")}</td>
                <td>
                  <span class="stage-label">${escapeHtml(displayStage(match.group || match.stage || "-"))}</span>
                </td>
                <td>
                  <div class="matchup-line">
                    ${teamLabel(match.home)}
                    <span>${t("vs")}</span>
                    ${teamLabel(match.away)}
                  </div>
                </td>
                <td><span class="status-pill">${escapeHtml(displayStatus(match.status || "-"))}</span></td>
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
    elements.forecastSelect.innerHTML = `<option>${t("noForecast")}</option>`;
    elements.forecasts.innerHTML = `<p class="empty-note">${t("noForecastMessage")}</p>`;
    return;
  }

  if (selectedForecastIndex >= forecasts.length) {
    selectedForecastIndex = 0;
  }

  elements.forecastSelect.innerHTML = forecasts
    .map((forecast, index) => `<option value="${index}">${escapeHtml(displayMatchName(forecast))}</option>`)
    .join("");
  elements.forecastSelect.value = String(selectedForecastIndex);

  const forecast = forecasts[selectedForecastIndex];
  const sheetPrediction = forecast.sheetPrediction;
  const eloPrediction = forecast.eloPrediction;
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
        <span>${escapeHtml(displayMatchName(forecast))}</span>
        <span class="probability-chip">${hasProbabilities ? `${escapeHtml(forecast.homeWin)}%` : t("fixture")}</span>
      </div>
      <div class="forecast-meta">
        <span>${escapeHtml(displayStatus(forecast.status || t("upcoming")))}</span>
        ${forecast.kickoff ? `<span>${escapeHtml(formatKickoff(forecast.kickoff))}</span>` : ""}
        <span>${escapeHtml(displaySource(forecast.source))}</span>
      </div>
      ${
        hasProbabilities
          ? `
            <div class="bar"><div class="bar-fill" style="width: ${Number(forecast.homeWin || 0)}%"></div></div>
            <div class="forecast-grid">
              <span>${teamLabel(forecast.home)} ${escapeHtml(forecast.homeWin)}%</span>
              <span>${t("draw")} ${escapeHtml(forecast.draw)}%</span>
              <span>${teamLabel(forecast.away)} ${escapeHtml(forecast.awayWin)}%</span>
            </div>
          `
          : `
            <div class="prediction-empty">
              <strong>${sheetPrediction ? t("oddsNotRefreshed") : t("predictionNotConfigured")}</strong>
              <span>${escapeHtml(forecast.predictionStatus || t("noForecastMessage"))}</span>
            </div>
          `
      }
      ${sheetPrediction ? renderSheetPrediction(sheetPrediction, forecast.home, forecast.away) : ""}
      ${eloPrediction ? renderEloPrediction(eloPrediction, forecast.home, forecast.away) : ""}
    </article>
  `;
}

function renderEloPrediction(prediction, home, away) {
  return `
    <div class="elo-prediction">
      <div class="elo-prediction-head">
        <span>${t("worldFootballElo")}</span>
        <strong>${escapeHtml(displayTeamName(prediction.lean))} ${currentLanguage === "zh" ? "較佔優" : "lean"}</strong>
      </div>
      <div class="elo-bars">
        <div>
          <div class="elo-row">
            ${teamLabel(home)}
            <strong>${escapeHtml(prediction.homeChance)}%</strong>
          </div>
          <div class="elo-bar"><span style="width: ${Number(prediction.homeChance || 0)}%"></span></div>
          <small>#${escapeHtml(prediction.home.rank)} · ${escapeHtml(prediction.home.rating)} Elo</small>
        </div>
        <div>
          <div class="elo-row">
            ${teamLabel(away)}
            <strong>${escapeHtml(prediction.awayChance)}%</strong>
          </div>
          <div class="elo-bar"><span style="width: ${Number(prediction.awayChance || 0)}%"></span></div>
          <small>#${escapeHtml(prediction.away.rank)} · ${escapeHtml(prediction.away.rating)} Elo</small>
        </div>
      </div>
      <p class="elo-formula">${t("kickoffFormula")}: ${escapeHtml(prediction.formula)}</p>
    </div>
  `;
}

function modelPickLabel(model, home, away) {
  if (model.pick === "Home") {
    return home;
  }
  if (model.pick === "Away") {
    return away;
  }
  return model.pick;
}

function renderSheetPrediction(prediction, home, away) {
  return `
    <div class="sheet-prediction">
      <div class="sheet-prediction-head">
        <span>${t("sheetConsensus")}</span>
        <strong>${escapeHtml(displayTeamName(prediction.consensus || t("noClearEdge")))}</strong>
      </div>
      <div class="model-picks">
        ${(prediction.models || [])
          .map(
            (model) => `
              <div class="model-pick">
                <span>${escapeHtml(model.model)}</span>
                <strong>${escapeHtml(displayTeamName(modelPickLabel(model, home, away)))}</strong>
                <small>${escapeHtml(displayTeamName(model.edge || t("noEdge")))}</small>
              </div>
            `
          )
          .join("")}
      </div>
    </div>
  `;
}

function renderChampionOdds(rows) {
  elements.championOdds.innerHTML = rows
    .map(
      (row) => `
        <div class="odds-row">
          <span><b>${teamLabel(row.team)}</b><small>${escapeHtml(displaySource(row.source || "Market"))}</small></span>
          <strong>${Number(row.odds || 0).toFixed(2)}</strong>
        </div>
      `
    )
    .join("");
}

function renderDashboard(data) {
  currentDashboard = data;
  elements.modeLabel.textContent = data.mode === "live" ? t("liveApiMode") : t("sampleMode");
  elements.updatedAt.textContent = formatDate(data.updatedAt);
  elements.groupCount.textContent = data.groups?.length ?? 0;
  elements.roundCount.textContent = data.bracket?.length ?? 0;
  elements.forecastCount.textContent = data.forecasts?.length ?? 0;
  if (data.setupRequired) {
    elements.message.innerHTML = `
      <strong>${t("setupNeeded")}</strong>
      ${escapeHtml(t("setupText").replace("{keys}", (data.missingConfig || []).join(" and ")))}
    `;
  } else if (data.error) {
    elements.message.innerHTML = `
      <strong>${t("liveApiRequestFailed")}</strong>
      ${escapeHtml(data.message || "")}
      <span>${t("providerNote")}: ${escapeHtml(data.error)}</span>
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
  elements.refreshLabel.textContent = t("refreshing");

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
    elements.refreshLabel.textContent = t("autoRefresh");
  }
}

async function refreshElo() {
  const originalText = elements.refreshEloButton.textContent;
  elements.refreshEloButton.textContent = t("refreshing");
  elements.refreshEloButton.disabled = true;

  try {
    const response = await fetch("api/refresh-elo", { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Elo refresh returned ${response.status}`);
    }
    await loadDashboard();
  } catch (error) {
    elements.message.innerHTML = `
      <strong>${t("eloRefreshFailed")}</strong>
      <span>${escapeHtml(error.message)}</span>
    `;
    elements.message.classList.add("error");
  } finally {
    elements.refreshEloButton.disabled = false;
    elements.refreshEloButton.textContent = originalText;
  }
}

function startAutoRefresh() {
  clearInterval(refreshTimer);
  refreshTimer = setInterval(loadDashboard, refreshMs);
}

elements.refreshButton.addEventListener("click", loadDashboard);
elements.refreshEloButton.addEventListener("click", refreshElo);
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
elements.langEn.addEventListener("click", () => setLanguage("en"));
elements.langZh.addEventListener("click", () => setLanguage("zh"));
applyLanguage();
loadDashboard();
startAutoRefresh();
