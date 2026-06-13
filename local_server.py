#!/usr/bin/env python3
import csv
import errno
import hashlib
import io
import json
import os
import time
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PUBLIC = ROOT / "public"
CACHE_DIR = ROOT / "api" / "cache"
PORT = int(os.environ.get("PORT", "8080"))
HOST = os.environ.get("HOST", "127.0.0.1")

CACHE = {}
ONE_HOUR_SECONDS = 60 * 60
FOOTBALL_DATA_CACHE_SECONDS = 12 * 60 * 60
MATCH_ODDS_CACHE_SECONDS = 30 * 60
CHAMPION_ODDS_CACHE_SECONDS = 24 * 60 * 60
ELO_CACHE_SECONDS = 12 * 60 * 60
GOOGLE_SHEET_CACHE_FILE = CACHE_DIR / "google_sheet_predictions.json"
HONG_KONG_TZ = timezone(timedelta(hours=8))


def load_dotenv():
    env_file = ROOT / ".env"
    if not env_file.exists():
        return

    for line in env_file.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if not os.environ.get(key):
            os.environ[key] = value


def cache_get(key):
    item = CACHE.get(key)
    if not item:
        return None
    if time.time() > item["expires_at"]:
        CACHE.pop(key, None)
        return None
    return item["value"]


def cache_set(key, value, ttl_seconds):
    CACHE[key] = {
        "value": value,
        "expires_at": time.time() + ttl_seconds,
    }


def cache_delete_prefix(prefix):
    for key in list(CACHE.keys()):
        if key.startswith(prefix):
            del CACHE[key]


def cached_loader(key, ttl_seconds, loader):
    cached = cache_get(key)
    if cached is not None:
        return cached
    value = loader()
    cache_set(key, value, ttl_seconds)
    return value


def next_11am_hong_kong_timestamp():
    now = datetime.now(HONG_KONG_TZ)
    today_11 = now.replace(hour=11, minute=0, second=0, microsecond=0)
    next_refresh = today_11 if now < today_11 else today_11 + timedelta(days=1)
    return next_refresh.timestamp()


def read_json_file(path):
    try:
        if path.exists():
            return json.loads(path.read_text())
    except (OSError, json.JSONDecodeError):
        return None
    return None


def write_json_file(path, payload):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2))


def sportmonks_get(path, params=None):
    token = os.environ.get("SPORTMONKS_API_TOKEN", "")
    base_url = os.environ.get("SPORTMONKS_BASE_URL", "https://api.sportmonks.com/v3/football").rstrip("/")

    if not token:
        raise RuntimeError("SPORTMONKS_API_TOKEN is not configured")

    query = {"api_token": token}
    query.update(params or {})
    url = f"{base_url}{path}?{urllib.parse.urlencode(query)}"
    request = urllib.request.Request(url, headers={"Accept": "application/json"})

    with urllib.request.urlopen(request, timeout=12) as response:
        return json.loads(response.read().decode("utf-8"))


def football_data_get(path, params=None):
    token = os.environ.get("FOOTBALL_DATA_TOKEN", "")
    base_url = os.environ.get("FOOTBALL_DATA_BASE_URL", "https://api.football-data.org/v4").rstrip("/")

    if not token:
        raise RuntimeError("FOOTBALL_DATA_TOKEN is not configured")

    cache_key = f"football-data:{path}:{urllib.parse.urlencode(params or {})}"

    def loader():
        url = f"{base_url}{path}"
        if params:
            url = f"{url}?{urllib.parse.urlencode(params)}"

        request = urllib.request.Request(
            url,
            headers={
                "Accept": "application/json",
                "X-Auth-Token": token,
            },
        )

        with urllib.request.urlopen(request, timeout=12) as response:
            return json.loads(response.read().decode("utf-8"))

    return cached_loader(cache_key, FOOTBALL_DATA_CACHE_SECONDS, loader)


def elo_ratings_get():
    return cached_loader("elo:world-ratings", ELO_CACHE_SECONDS, elo_ratings_get_uncached)


def elo_ratings_get_uncached():
    base_url = os.environ.get("ELO_RATINGS_BASE_URL", "https://www.eloratings.net").rstrip("/")
    team_names = fetch_elo_team_names(base_url)
    request = urllib.request.Request(f"{base_url}/World.tsv", headers={"Accept": "text/tab-separated-values"})
    with urllib.request.urlopen(request, timeout=15) as response:
        world_tsv = response.read().decode("utf-8")

    ratings = {}
    for line in world_tsv.splitlines():
        columns = line.split("\t")
        if len(columns) < 4:
            continue
        rank = parse_int(columns[0])
        code = columns[2]
        rating = parse_int(columns[3])
        team_name = team_names.get(code)
        if not team_name or rank is None or rating is None:
            continue
        ratings[canonical_team_name(team_name)] = {
            "team": team_name,
            "code": code,
            "rank": rank,
            "rating": rating,
        }
    return ratings


def fetch_elo_team_names(base_url):
    request = urllib.request.Request(f"{base_url}/en.teams.tsv", headers={"Accept": "text/tab-separated-values"})
    with urllib.request.urlopen(request, timeout=15) as response:
        teams_tsv = response.read().decode("utf-8")

    teams = {}
    for line in teams_tsv.splitlines():
        columns = line.split("\t")
        if len(columns) >= 2:
            teams[columns[0]] = columns[1]
    return teams


def parse_int(value):
    try:
        return int(str(value).replace("−", "-"))
    except (TypeError, ValueError):
        return None


def google_sheet_predictions_get():
    cached = read_json_file(GOOGLE_SHEET_CACHE_FILE)
    now = time.time()
    if cached and cached.get("expires_at", 0) > now:
        return cached.get("data", {})

    sheet_url = os.environ.get(
        "GOOGLE_SHEET_PREDICTIONS_CSV_URL",
        "",
    )
    if not sheet_url:
        return {}

    try:
        request = urllib.request.Request(sheet_url, headers={"Accept": "text/csv"})
        with urllib.request.urlopen(request, timeout=15) as response:
            csv_text = response.read().decode("utf-8-sig")
        predictions = parse_prediction_sheet(csv_text)
        write_json_file(
            GOOGLE_SHEET_CACHE_FILE,
            {
                "fetched_at": now,
                "expires_at": next_11am_hong_kong_timestamp(),
                "source_hash": hashlib.sha256(csv_text.encode("utf-8")).hexdigest(),
                "data": predictions,
            },
        )
        return predictions
    except Exception:
        if cached:
            return cached.get("data", {})
        return {}


def parse_prediction_sheet(csv_text):
    rows = csv.DictReader(io.StringIO(csv_text))
    predictions = {}
    for row in rows:
        match_number = str(row.get("Match#") or "").strip()
        home = str(row.get("Home") or "").strip()
        away = str(row.get("Away") or "").strip()
        if not match_number.isdigit() or not home or not away:
            continue

        model_picks = [
            normalize_sheet_pick("AI", row.get("AI sheet"), row.get("AI Bet")),
            normalize_sheet_pick("FIFA", row.get("FIFA sheet"), row.get("FIFA Bet")),
            normalize_sheet_pick("Silver", row.get("Silver sheet"), row.get("Silver Bet")),
        ]
        prediction = {
            "matchNumber": int(match_number),
            "home": home,
            "away": away,
            "models": model_picks,
            "consensus": consensus_pick(model_picks, home, away),
            "source": "Google Sheet MASTER_ODDS",
        }
        predictions[match_key(home, away)] = prediction
    return predictions


def normalize_sheet_pick(model, edge, bet):
    bet = str(bet or "").strip()
    edge = str(edge or "").strip()
    if bet in {"—", "-", ""}:
        pick = "No edge"
    elif bet.lower() == "home":
        pick = "Home"
    elif bet.lower() == "away":
        pick = "Away"
    elif bet.lower() == "draw":
        pick = "Draw"
    else:
        pick = bet
    return {
        "model": model,
        "edge": edge or "No edge",
        "pick": pick,
    }


def consensus_pick(models, home, away):
    counts = {}
    for model in models:
        pick = model.get("pick")
        if pick and pick != "No edge":
            counts[pick] = counts.get(pick, 0) + 1
    if not counts:
        return "No clear edge"
    best_pick, best_count = sorted(counts.items(), key=lambda item: (-item[1], item[0]))[0]
    if best_count < 2:
        return "Split signal"
    if best_pick == "Home":
        return f"{home} value"
    if best_pick == "Away":
        return f"{away} value"
    return f"{best_pick} value"


def odds_api_get_champion():
    return cached_loader("odds:champion", CHAMPION_ODDS_CACHE_SECONDS, odds_api_get_champion_uncached)


def odds_api_get_champion_uncached():
    api_key = os.environ.get("ODDS_API_KEY", "")
    if not api_key:
        return []

    sport_key = os.environ.get("ODDS_API_WORLD_CUP_OUTRIGHT_SPORT_KEY", "soccer_fifa_world_cup_winner")
    base_url = os.environ.get("ODDS_API_BASE_URL", "https://api.the-odds-api.com/v4").rstrip("/")
    params = urllib.parse.urlencode(
        {
            "apiKey": api_key,
            "regions": os.environ.get("ODDS_API_REGIONS", "us,uk,eu"),
            "markets": "outrights",
            "oddsFormat": "decimal",
        }
    )
    request = urllib.request.Request(f"{base_url}/sports/{sport_key}/odds?{params}", headers={"Accept": "application/json"})

    with urllib.request.urlopen(request, timeout=12) as response:
        payload = json.loads(response.read().decode("utf-8"))

    rows = {}
    for event in payload:
        for bookmaker in event.get("bookmakers", []):
            for market in bookmaker.get("markets", []):
                if market.get("key") != "outrights":
                    continue
                for outcome in market.get("outcomes", []):
                    team = outcome.get("name")
                    price = outcome.get("price")
                    if not team or not isinstance(price, (int, float)):
                        continue
                    current = rows.get(team)
                    if not current or price > current["odds"]:
                        rows[team] = {
                            "team": team,
                            "odds": price,
                            "source": bookmaker.get("title", "Bookmaker"),
                        }

    return sorted(rows.values(), key=lambda row: row["odds"])[:12]


def odds_api_get_match_predictions():
    return cached_loader("odds:match:h2h", MATCH_ODDS_CACHE_SECONDS, odds_api_get_match_predictions_uncached)


def odds_api_get_match_predictions_uncached():
    api_key = os.environ.get("ODDS_API_KEY", "")
    if not api_key:
        return {}

    sport_key = os.environ.get("ODDS_API_MATCH_SPORT_KEY", "soccer_fifa_world_cup")
    base_url = os.environ.get("ODDS_API_BASE_URL", "https://api.the-odds-api.com/v4").rstrip("/")
    params = urllib.parse.urlencode(
        {
            "apiKey": api_key,
            "regions": os.environ.get("ODDS_API_REGIONS", "us,uk,eu"),
            "markets": "h2h",
            "oddsFormat": "decimal",
        }
    )
    request = urllib.request.Request(f"{base_url}/sports/{sport_key}/odds?{params}", headers={"Accept": "application/json"})

    with urllib.request.urlopen(request, timeout=12) as response:
        payload = json.loads(response.read().decode("utf-8"))

    predictions = {}
    for event in payload:
        home = event.get("home_team")
        away = event.get("away_team")
        if not home or not away:
            continue

        accumulator = {}
        for bookmaker in event.get("bookmakers", []):
            for market in bookmaker.get("markets", []):
                if market.get("key") != "h2h":
                    continue
                implied = []
                for outcome in market.get("outcomes", []):
                    price = outcome.get("price")
                    if isinstance(price, (int, float)) and price > 1:
                        implied.append((outcome.get("name"), 1 / price))
                total = sum(value for _, value in implied)
                if not total:
                    continue
                for name, value in implied:
                    accumulator.setdefault(name, []).append((value / total) * 100)

        averaged = {
            name: sum(values) / len(values)
            for name, values in accumulator.items()
            if values
        }
        if averaged:
            predictions[match_key(home, away)] = averaged

    return predictions


def match_key(home, away):
    return " v ".join(sorted([canonical_team_name(home), canonical_team_name(away)]))


def canonical_team_name(name):
    aliases = {
        "usa": "united states",
        "us": "united states",
        "united states of america": "united states",
        "ivory coast": "cote divoire",
        "cote d'ivoire": "cote divoire",
        "côte d’ivoire": "cote divoire",
        "curaçao": "curacao",
        "bosnia-herzegovina": "bosnia and herzegovina",
        "south korea": "korea republic",
    }
    normalized = (
        str(name or "")
        .lower()
        .replace(" cf", "")
        .replace(" fc", "")
        .replace(".", "")
        .replace("’", "'")
        .strip()
    )
    normalized = aliases.get(normalized, normalized)
    return "".join(char for char in normalized if char.isalnum() or char.isspace()).strip()


WORLD_CUP_GROUPS = [
    ("Group A", ["Mexico", "South Africa", "South Korea", "Czechia"]),
    ("Group B", ["Canada", "Bosnia and Herzegovina", "Qatar", "Switzerland"]),
    ("Group C", ["Brazil", "Morocco", "Haiti", "Scotland"]),
    ("Group D", ["United States", "Paraguay", "Australia", "Turkey"]),
    ("Group E", ["Germany", "Cote d'Ivoire", "Ecuador", "Curacao"]),
    ("Group F", ["Netherlands", "Japan", "Sweden", "Tunisia"]),
    ("Group G", ["Belgium", "Egypt", "Iran", "New Zealand"]),
    ("Group H", ["Spain", "Cape Verde", "Saudi Arabia", "Uruguay"]),
    ("Group I", ["France", "Senegal", "Iraq", "Norway"]),
    ("Group J", ["Argentina", "Algeria", "Austria", "Jordan"]),
    ("Group K", ["Portugal", "Colombia", "Uzbekistan", "DR Congo"]),
    ("Group L", ["England", "Croatia", "Ghana", "Panama"]),
]


def sample_team_row(team, index):
    return {
        "team": team,
        "played": 0,
        "won": 0,
        "drawn": 0,
        "lost": 0,
        "goalsFor": 0,
        "goalsAgainst": 0,
        "points": 0,
    }


def sample_groups():
    return [
        {
            "name": group_name,
            "teams": [sample_team_row(team, index) for index, team in enumerate(teams)],
        }
        for group_name, teams in WORLD_CUP_GROUPS
    ]


def sample_bracket():
    round_of_32 = [
        ("Winner Group A", "3rd C/E/F/H/I"),
        ("Winner Group C", "3rd A/B/F/H/I"),
        ("Winner Group E", "3rd A/B/C/D/F"),
        ("Winner Group G", "3rd A/E/H/I/J"),
        ("Winner Group I", "3rd C/D/F/G/H"),
        ("Winner Group J", "3rd B/E/F/I/J"),
        ("Winner Group K", "3rd D/E/I/J/L"),
        ("Winner Group L", "3rd E/H/I/J/K"),
        ("Winner Group B", "3rd E/F/G/I/J"),
        ("Winner Group D", "3rd B/E/F/I/J"),
        ("Winner Group F", "Runner-up Group C"),
        ("Winner Group H", "Runner-up Group J"),
        ("Runner-up Group A", "Runner-up Group B"),
        ("Runner-up Group D", "Runner-up Group G"),
        ("Runner-up Group E", "Runner-up Group I"),
        ("Runner-up Group K", "Runner-up Group L"),
    ]
    return [
        {
            "round": "Round of 32",
            "matches": [{"home": home, "away": away, "score": "TBD", "status": "Seeded", "winner": ""} for home, away in round_of_32],
        },
        {
            "round": "Round of 16",
            "matches": [{"home": f"R32 Winner {i}", "away": f"R32 Winner {i + 1}", "score": "TBD", "status": "Pending", "winner": ""} for i in range(1, 16, 2)],
        },
        {
            "round": "Quarter Finals",
            "matches": [{"home": f"R16 Winner {i}", "away": f"R16 Winner {i + 1}", "score": "TBD", "status": "Pending", "winner": ""} for i in range(1, 8, 2)],
        },
        {
            "round": "Semi Finals",
            "matches": [{"home": f"QF Winner {i}", "away": f"QF Winner {i + 1}", "score": "TBD", "status": "Pending", "winner": ""} for i in range(1, 4, 2)],
        },
        {
            "round": "Final",
            "matches": [{"home": "Semi-final Winner 1", "away": "Semi-final Winner 2", "score": "TBD", "status": "Pending", "winner": ""}],
        },
    ]


def sample_dashboard():
    return {
        "mode": "sample",
        "updatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "message": "Actual standings are shown only from the live API. Sample mode keeps tables at zero until FOOTBALL_DATA_TOKEN or Sportmonks credentials are configured.",
        "groups": sample_groups(),
        "results": [
            {"home": "Mexico", "away": "South Africa", "score": "Upcoming", "status": "Group A"},
            {"home": "Canada", "away": "Qatar", "score": "Upcoming", "status": "Group B"},
            {"home": "Brazil", "away": "Morocco", "score": "Upcoming", "status": "Group C"},
            {"home": "United States", "away": "Paraguay", "score": "Upcoming", "status": "Group D"},
            {"home": "Germany", "away": "Cote d'Ivoire", "score": "Upcoming", "status": "Group E"},
            {"home": "Spain", "away": "Cape Verde", "score": "Upcoming", "status": "Group H"},
        ],
        "bracket": sample_bracket(),
        "forecasts": [
            {
                "match": "Mexico vs South Africa",
                "home": "Mexico",
                "away": "South Africa",
                "homeWin": None,
                "draw": None,
                "awayWin": None,
                "status": "Upcoming",
                "source": "football-data.org fixture",
                "predictionStatus": "Configure ODDS_API_KEY or Sportmonks Predictions to show real probabilities.",
            },
            {
                "match": "Canada vs Qatar",
                "home": "Canada",
                "away": "Qatar",
                "homeWin": None,
                "draw": None,
                "awayWin": None,
                "status": "Upcoming",
                "source": "football-data.org fixture",
                "predictionStatus": "Configure ODDS_API_KEY or Sportmonks Predictions to show real probabilities.",
            },
        ],
        "championOdds": [
            {"team": "Argentina", "odds": 5.5, "source": "Power Rank"},
            {"team": "France", "odds": 6.0, "source": "Power Rank"},
            {"team": "Brazil", "odds": 7.0, "source": "Power Rank"},
            {"team": "England", "odds": 8.5, "source": "Power Rank"},
            {"team": "Spain", "odds": 9.0, "source": "Power Rank"},
            {"team": "Portugal", "odds": 10.0, "source": "Power Rank"},
            {"team": "Germany", "odds": 11.0, "source": "Power Rank"},
            {"team": "Netherlands", "odds": 13.0, "source": "Power Rank"},
        ],
    }


def normalized_from_sportmonks():
    season_id = os.environ.get("SPORTMONKS_WORLD_CUP_SEASON_ID", "")
    if not season_id:
        raise RuntimeError("SPORTMONKS_WORLD_CUP_SEASON_ID is not configured")

    standings = sportmonks_get(
        f"/standings/seasons/{season_id}",
        {"include": "participant;group;details.type"},
    ).get("data", [])
    schedules = sportmonks_get(
        f"/schedules/seasons/{season_id}",
        {"include": "round.stage;fixtures.participants;fixtures.scores;fixtures.state"},
    ).get("data", [])

    groups = {}
    for row in standings:
        group_name = (row.get("group") or {}).get("name") or "Group"
        details = {}
        for detail in row.get("details", []) or []:
            code = ((detail.get("type") or {}).get("code") or (detail.get("type") or {}).get("name") or "").lower()
            details[code] = detail.get("value", 0)

        groups.setdefault(group_name, []).append(
            {
                "team": (row.get("participant") or {}).get("name", "Team"),
                "played": details.get("overall-matches-played", details.get("played", 0)),
                "won": details.get("overall-won", details.get("won", 0)),
                "drawn": details.get("overall-draw", details.get("draw", 0)),
                "lost": details.get("overall-lost", details.get("lost", 0)),
                "goalsFor": details.get("overall-goals-for", details.get("goals for", 0)),
                "goalsAgainst": details.get("overall-goals-against", details.get("goals against", 0)),
                "points": details.get("overall-points", details.get("points", row.get("points", 0))),
            }
        )

    results = []
    bracket = {}
    for schedule in schedules:
        round_data = schedule.get("round") or {}
        stage = round_data.get("stage") or schedule.get("stage") or {}
        stage_label = round_data.get("name") or stage.get("name") or "Fixtures"

        for fixture in schedule.get("fixtures", []) or []:
            participants = fixture.get("participants", []) or []
            home = next((team for team in participants if (team.get("meta") or {}).get("location") == "home"), None)
            away = next((team for team in participants if (team.get("meta") or {}).get("location") == "away"), None)
            if len(participants) >= 2:
                home = home or participants[0]
                away = away or participants[1]

            home_name = (home or {}).get("name", "TBD")
            away_name = (away or {}).get("name", "TBD")
            score = fixture_score(fixture, home, away)
            state = fixture.get("state") or {}
            match = {
                "home": home_name,
                "away": away_name,
                "score": score,
                "status": state.get("short_name") or state.get("name") or "Scheduled",
                "winner": winner_name(home, away),
            }

            if "final" in stage_label.lower() or "round" in stage_label.lower() or "quarter" in stage_label.lower() or "semi" in stage_label.lower():
                bracket.setdefault(stage_label, []).append(match)
            else:
                results.append(match)

    return {
        "mode": "live",
        "updatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "message": "Live provider data loaded through the local API proxy.",
        "groups": [{"name": key, "teams": value} for key, value in groups.items()],
        "results": results[:20],
        "bracket": [{"round": key, "matches": value} for key, value in bracket.items()],
        "forecasts": sample_dashboard()["forecasts"],
        "championOdds": odds_api_get_champion() or sample_dashboard()["championOdds"],
    }


def normalize_group_name(group):
    if not group:
        return ""
    return str(group).replace("_", " ").title()


def normalized_from_football_data():
    standings_payload = football_data_get("/competitions/WC/standings")
    matches_payload = football_data_get("/competitions/WC/matches")
    matches = matches_payload.get("matches", [])
    should_refresh_predictions = has_match_within_next_hour(matches)
    odds_predictions = odds_api_get_match_predictions() if should_refresh_predictions else {}
    sheet_predictions = google_sheet_predictions_get()
    elo_ratings = elo_ratings_get()

    groups = []
    for standing in standings_payload.get("standings", []):
        if standing.get("type") != "TOTAL":
            continue

        rows = []
        for row in standing.get("table", []):
            team = row.get("team") or {}
            rows.append(
                {
                    "team": team.get("name", "Team"),
                    "played": row.get("playedGames", 0),
                    "won": row.get("won", 0),
                    "drawn": row.get("draw", 0),
                    "lost": row.get("lost", 0),
                    "goalsFor": row.get("goalsFor", 0),
                    "goalsAgainst": row.get("goalsAgainst", 0),
                    "points": row.get("points", 0),
                }
            )

        groups.append(
            {
                "name": normalize_group_name(standing.get("group")),
                "teams": rows,
            }
        )

    results = []
    all_matches = []
    bracket = {}
    for match in matches_payload.get("matches", []):
        home = (match.get("homeTeam") or {}).get("name") or "TBD"
        away = (match.get("awayTeam") or {}).get("name") or "TBD"
        score_data = match.get("score") or {}
        full_time = score_data.get("fullTime") or {}
        score = "Upcoming"

        if full_time.get("home") is not None and full_time.get("away") is not None:
            score = f"{full_time.get('home')}-{full_time.get('away')}"

        item = {
            "home": home,
            "away": away,
            "score": score,
            "status": match.get("status", "SCHEDULED"),
            "winner": "",
        }

        stage = match.get("stage") or "Group Stage"
        matchday = match.get("matchday")
        all_matches.append(
            {
                **item,
                "stage": stage.replace("_", " ").title(),
                "group": normalize_group_name(match.get("group")),
                "matchday": matchday,
                "kickoff": match.get("utcDate"),
            }
        )

        if "LAST_" in stage or "QUARTER" in stage or "SEMI" in stage or "FINAL" in stage:
            bracket.setdefault(stage.replace("_", " ").title(), []).append(item)
        else:
            results.append(item)

    all_matches.sort(key=lambda match: match.get("kickoff") or "")

    return {
        "mode": "live",
        "updatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "message": "Live provider data loaded from football-data.org. Match/standing data is cached for 12 hours.",
        "groups": groups or sample_groups(),
        "results": results[:24],
        "allMatches": all_matches,
        "bracket": [{"round": key, "matches": value} for key, value in bracket.items()] or sample_bracket(),
        "forecasts": build_forecasts_from_matches(matches, odds_predictions, should_refresh_predictions, sheet_predictions, elo_ratings),
        "championOdds": odds_api_get_champion() or sample_dashboard()["championOdds"],
    }


def parse_utc(value):
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def has_match_within_next_hour(matches):
    now = datetime.now(timezone.utc)
    window_end = now + timedelta(seconds=ONE_HOUR_SECONDS)
    for match in matches:
        if match.get("status") not in {"SCHEDULED", "TIMED"}:
            continue
        kickoff = parse_utc(match.get("utcDate"))
        if kickoff and now <= kickoff <= window_end:
            return True
    return False


def build_forecasts_from_matches(matches, odds_predictions, odds_refresh_allowed, sheet_predictions=None, elo_ratings=None):
    sheet_predictions = sheet_predictions or {}
    elo_ratings = elo_ratings or {}
    upcoming_statuses = {"SCHEDULED", "TIMED", "IN_PLAY", "PAUSED"}
    candidate_matches = [
        match
        for match in matches
        if match.get("status") in upcoming_statuses
    ]
    candidate_matches.sort(key=lambda match: match.get("utcDate") or "")

    forecasts = []
    for match in candidate_matches:
        home = (match.get("homeTeam") or {}).get("name") or "TBD"
        away = (match.get("awayTeam") or {}).get("name") or "TBD"
        odds = odds_predictions.get(match_key(home, away), {})
        sheet_prediction = sheet_predictions.get(match_key(home, away))
        elo_prediction = elo_prediction_for_match(home, away, elo_ratings)

        home_win = odds.get(home)
        away_win = odds.get(away)
        draw = odds.get("Draw")

        forecasts.append(
            {
                "match": f"{home} vs {away}",
                "home": home,
                "away": away,
                "homeWin": round(home_win, 1) if home_win is not None else None,
                "draw": round(draw, 1) if draw is not None else None,
                "awayWin": round(away_win, 1) if away_win is not None else None,
                "kickoff": match.get("utcDate"),
                "status": match.get("status", "SCHEDULED"),
                "source": forecast_source(odds, sheet_prediction),
                "predictionStatus": prediction_status_for_match(match, odds, odds_refresh_allowed),
                "sheetPrediction": sheet_prediction,
                "eloPrediction": elo_prediction,
            }
        )

    return forecasts or sample_dashboard()["forecasts"]


def elo_prediction_for_match(home, away, elo_ratings):
    home_elo = elo_ratings.get(canonical_team_name(home))
    away_elo = elo_ratings.get(canonical_team_name(away))
    if not home_elo or not away_elo:
        return None

    home_expected = 1 / (1 + pow(10, (away_elo["rating"] - home_elo["rating"]) / 400))
    away_expected = 1 - home_expected
    return {
        "formula": "1 / (1 + 10^((opponent_rating - team_rating) / 400))",
        "home": home_elo,
        "away": away_elo,
        "homeChance": round(home_expected * 100, 1),
        "awayChance": round(away_expected * 100, 1),
        "lean": home if home_expected >= away_expected else away,
        "ratingDiff": home_elo["rating"] - away_elo["rating"],
        "source": "World Football Elo Ratings",
    }


def forecast_source(odds, sheet_prediction):
    if odds and sheet_prediction:
        return "Google Sheet + The Odds API"
    if sheet_prediction:
        return "Google Sheet MASTER_ODDS"
    if odds:
        return "The Odds API h2h market"
    return "football-data.org fixture"


def prediction_status_for_match(match, odds, odds_refresh_allowed):
    if odds:
        return ""
    kickoff = parse_utc(match.get("utcDate"))
    if not os.environ.get("ODDS_API_KEY"):
        return "Add ODDS_API_KEY to show real probabilities."
    if not odds_refresh_allowed:
        if kickoff:
            return "Odds refresh is limited to one hour before kickoff to protect the 500/month quota."
        return "Odds refresh is limited until kickoff time is available."
    return "Odds provider did not return a matching market for this fixture."


def fixture_score(fixture, home, away):
    scores = fixture.get("scores", []) or []
    values = {}
    for score in scores:
        participant_id = score.get("participant_id")
        goals = (score.get("score") or {}).get("goals")
        if participant_id is not None and goals is not None:
            values[participant_id] = goals

    if home and away and home.get("id") in values and away.get("id") in values:
        return f"{values[home.get('id')]}-{values[away.get('id')]}"
    return "Upcoming"


def winner_name(home, away):
    for team in (home, away):
        if team and (team.get("meta") or {}).get("winner"):
            return team.get("name", "")
    return ""


def dashboard_payload():
    cached = cache_get("dashboard")
    if cached:
        return cached

    football_data_configured = bool(os.environ.get("FOOTBALL_DATA_TOKEN"))
    sportmonks_configured = bool(os.environ.get("SPORTMONKS_API_TOKEN") and os.environ.get("SPORTMONKS_WORLD_CUP_SEASON_ID"))

    if not football_data_configured and not sportmonks_configured:
        payload = sample_dashboard()
        payload["setupRequired"] = True
        payload["missingConfig"] = ["FOOTBALL_DATA_TOKEN"]
        cache_set("dashboard", payload, 15)
        return payload

    try:
        if football_data_configured:
            payload = normalized_from_football_data()
        else:
            payload = normalized_from_sportmonks()
        cache_set("dashboard", payload, 15)
        return payload
    except Exception as error:
        payload = sample_dashboard()
        payload["error"] = str(error)
        cache_set("dashboard", payload, 15)
        return payload


def refresh_elo_payload():
    cache_delete_prefix("elo:")
    cache_delete_prefix("dashboard")
    ratings = elo_ratings_get()
    return {
        "ok": True,
        "updatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "teams": len(ratings),
        "message": "Elo ratings refreshed from eloratings.net.",
    }


class Handler(BaseHTTPRequestHandler):
    def do_HEAD(self):
        parsed = urllib.parse.urlparse(self.path)
        path = "/index.html" if parsed.path == "/" else parsed.path
        file_path = (PUBLIC / path.lstrip("/")).resolve()

        if not str(file_path).startswith(str(PUBLIC.resolve())) or not file_path.exists():
            self.send_error(404)
            return

        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(file_path.stat().st_size))
        self.end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        if path == "/api/dashboard":
            self.send_json(dashboard_payload())
            return

        if path == "/api/refresh-elo":
            self.send_json(refresh_elo_payload())
            return

        if path == "/":
            path = "/index.html"

        file_path = (PUBLIC / path.lstrip("/")).resolve()
        if not str(file_path).startswith(str(PUBLIC.resolve())) or not file_path.exists():
            self.send_error(404)
            return

        content_type = "text/html"
        if file_path.suffix == ".css":
            content_type = "text/css"
        elif file_path.suffix == ".js":
            content_type = "text/javascript"

        body = file_path.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", f"{content_type}; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def send_json(self, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format, *args):
        print("%s - %s" % (self.address_string(), format % args))


if __name__ == "__main__":
    load_dotenv()
    server = None
    selected_port = PORT

    for candidate_port in range(PORT, PORT + 20):
        try:
            server = ThreadingHTTPServer((HOST, candidate_port), Handler)
            selected_port = candidate_port
            break
        except OSError as error:
            if error.errno not in (errno.EADDRINUSE, 48, 98):
                raise

    if server is None:
        raise RuntimeError(f"Could not find an available port between {PORT} and {PORT + 19}")

    display_host = "localhost" if HOST in ("127.0.0.1", "localhost") else HOST
    print(f"World Cup Prediction webpage running at http://{display_host}:{selected_port}")
    print("Press Ctrl+C to stop the server.")
    server.serve_forever()
