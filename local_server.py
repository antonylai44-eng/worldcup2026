#!/usr/bin/env python3
import csv
import errno
import hashlib
import html
import io
import json
import os
import re
import time
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from xml.etree import ElementTree

ROOT = Path(__file__).resolve().parent
PUBLIC = ROOT / "public"
CACHE_DIR = ROOT / "api" / "cache"
PORT = int(os.environ.get("PORT", "8080"))
HOST = os.environ.get("HOST", "127.0.0.1")

CACHE = {}
FOOTBALL_DATA_CACHE_SECONDS = 12 * 60 * 60
MATCH_ODDS_CACHE_SECONDS = 12 * 60 * 60
CHAMPION_ODDS_CACHE_SECONDS = 24 * 60 * 60
ELO_CACHE_SECONDS = 12 * 60 * 60
NEWS_CACHE_SECONDS = 30 * 60
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


def api_football_get(path, params=None):
    token = os.environ.get("API_FOOTBALL_KEY", "")
    base_url = os.environ.get("API_FOOTBALL_BASE_URL", "https://v3.football.api-sports.io").rstrip("/")

    if not token:
        raise RuntimeError("API_FOOTBALL_KEY is not configured")

    cache_key = f"api-football:{path}:{urllib.parse.urlencode(params or {})}"

    def loader():
        url = f"{base_url}{path}"
        if params:
            url = f"{url}?{urllib.parse.urlencode(params)}"

        headers = {
            "Accept": "application/json",
            "x-apisports-key": token,
        }
        host = os.environ.get("API_FOOTBALL_HOST", "").strip()
        if host:
            headers["x-rapidapi-host"] = host

        request = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(request, timeout=12) as response:
            return json.loads(response.read().decode("utf-8"))

    return cached_loader(cache_key, MATCH_ODDS_CACHE_SECONDS, loader)


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
        names = team_names.get(code) or []
        team_name = names[0] if names else ""
        if not team_name or rank is None or rating is None:
            continue
        rating_payload = {
            "team": team_name,
            "code": code,
            "rank": rank,
            "rating": rating,
        }
        for name in names:
            ratings[canonical_team_name(name)] = rating_payload
    return ratings


def fetch_elo_team_names(base_url):
    request = urllib.request.Request(f"{base_url}/en.teams.tsv", headers={"Accept": "text/tab-separated-values"})
    with urllib.request.urlopen(request, timeout=15) as response:
        teams_tsv = response.read().decode("utf-8")

    teams = {}
    for line in teams_tsv.splitlines():
        columns = line.split("\t")
        if len(columns) >= 2:
            teams[columns[0]] = [column for column in columns[1:] if column]
    return teams


def parse_int(value):
    try:
        return int(str(value).replace("−", "-"))
    except (TypeError, ValueError):
        return None


def parse_percent(value):
    try:
        return round(float(str(value).replace("%", "").strip()), 1)
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


def api_football_prediction_for_match(home, away, kickoff):
    if not os.environ.get("API_FOOTBALL_KEY"):
        return provider_stub("api-football", "API-Football", False, "API_FOOTBALL_KEY is not configured.")

    cache_key = f"api-football:prediction:{canonical_team_name(home)}:{canonical_team_name(away)}:{kickoff or ''}"

    def loader():
        parsed = parse_utc(kickoff)
        if not parsed:
            return provider_stub("api-football", "API-Football", True, "Kickoff date is missing for this fixture.")

        dates = {
            parsed.strftime("%Y-%m-%d"),
            (parsed - timedelta(days=1)).strftime("%Y-%m-%d"),
            (parsed + timedelta(days=1)).strftime("%Y-%m-%d"),
        }

        league = os.environ.get("API_FOOTBALL_WORLD_CUP_LEAGUE_ID", "").strip()
        season = os.environ.get("API_FOOTBALL_SEASON", "").strip()

        for date_value in sorted(dates):
            params = {"date": date_value}
            if league:
                params["league"] = league
            if season:
                params["season"] = season

            fixtures_payload = api_football_get("/fixtures", params)
            for fixture in fixtures_payload.get("response", []):
                teams = fixture.get("teams") or {}
                if canonical_team_name((teams.get("home") or {}).get("name")) != canonical_team_name(home):
                    continue
                if canonical_team_name((teams.get("away") or {}).get("name")) != canonical_team_name(away):
                    continue

                fixture_id = ((fixture.get("fixture") or {}).get("id"))
                if not fixture_id:
                    continue

                prediction_payload = api_football_get("/predictions", {"fixture": fixture_id})
                prediction = (prediction_payload.get("response") or [{}])[0]
                percent = (prediction.get("predictions") or {}).get("percent") or {}
                home_win = parse_percent(percent.get("home"))
                draw = parse_percent(percent.get("draw"))
                away_win = parse_percent(percent.get("away"))
                outcomes = sorted_outcomes((home, home_win), draw, (away, away_win))
                edge = outcomes[0]["probability"] - outcomes[1]["probability"] if len(outcomes) > 1 else None

                return {
                    "id": "api-football",
                    "name": "API-Football",
                    "configured": True,
                    "available": bool(outcomes),
                    "homeWin": home_win,
                    "draw": draw,
                    "awayWin": away_win,
                    "pick": ((prediction.get("predictions") or {}).get("winner") or {}).get("name") or (outcomes[0]["label"] if outcomes else None),
                    "confidence": confidence_label(edge),
                    "message": "",
                    "advice": (prediction.get("predictions") or {}).get("advice") or "",
                }

        return provider_stub("api-football", "API-Football", True, "API-Football did not return a matching fixture.")

    return cached_loader(cache_key, MATCH_ODDS_CACHE_SECONDS, loader)


def sportmonks_schedule_index():
    season_id = os.environ.get("SPORTMONKS_WORLD_CUP_SEASON_ID", "")
    token = os.environ.get("SPORTMONKS_API_TOKEN", "")
    if not token or not season_id:
        return []

    def loader():
        schedules = sportmonks_get(
            f"/schedules/seasons/{season_id}",
            {"include": "round.stage;fixtures.participants;fixtures.state"},
        ).get("data", [])

        fixtures = []
        for schedule in schedules:
            for fixture in schedule.get("fixtures", []) or []:
                participants = fixture.get("participants", []) or []
                home_team = next((team for team in participants if (team.get("meta") or {}).get("location") == "home"), None)
                away_team = next((team for team in participants if (team.get("meta") or {}).get("location") == "away"), None)
                if len(participants) >= 2:
                    home_team = home_team or participants[0]
                    away_team = away_team or participants[1]
                fixtures.append(
                    {
                        "id": fixture.get("id"),
                        "kickoff": fixture.get("starting_at"),
                        "home": (home_team or {}).get("name"),
                        "away": (away_team or {}).get("name"),
                    }
                )
        return fixtures

    return cached_loader("sportmonks:fixtures:index", FOOTBALL_DATA_CACHE_SECONDS, loader)


def sportmonks_prediction_for_match(home, away, kickoff):
    configured = bool(os.environ.get("SPORTMONKS_API_TOKEN") and os.environ.get("SPORTMONKS_WORLD_CUP_SEASON_ID"))
    if not configured:
        return provider_stub("sportmonks", "Sportmonks", False, "Sportmonks predictions are not configured.")

    cache_key = f"sportmonks:prediction:{canonical_team_name(home)}:{canonical_team_name(away)}:{kickoff or ''}"

    def loader():
        parsed = parse_utc(kickoff)
        fixtures = sportmonks_schedule_index()
        matched = None
        for fixture in fixtures:
            if canonical_team_name(fixture.get("home")) != canonical_team_name(home):
                continue
            if canonical_team_name(fixture.get("away")) != canonical_team_name(away):
                continue
            if parsed and fixture.get("kickoff"):
                fixture_parsed = parse_utc(fixture.get("kickoff"))
                if fixture_parsed and abs((fixture_parsed - parsed).total_seconds()) > 12 * 60 * 60:
                    continue
            matched = fixture
            break

        if not matched or not matched.get("id"):
            return provider_stub("sportmonks", "Sportmonks", True, "Sportmonks did not return a matching fixture.")

        payload = sportmonks_get(
            f"/predictions/probabilities/fixtures/{matched['id']}",
            {"include": "type;fixture.participants"},
        ).get("data", [])
        winner_market = next(
            (
                item
                for item in payload
                if re.search(r"winner|fulltime|1x2", f"{((item.get('type') or {}).get('name') or '')} {((item.get('type') or {}).get('code') or '')}", re.IGNORECASE)
            ),
            None,
        )

        home_win = None
        draw = None
        away_win = None
        for prediction in (winner_market or {}).get("predictions", []) or []:
            value = canonical_team_name(prediction.get("value"))
            probability = parse_percent(prediction.get("probability"))
            if probability is None:
                continue
            if value in {"1", "home", canonical_team_name(home)}:
                home_win = probability
            elif value in {"x", "draw", "tie"}:
                draw = probability
            elif value in {"2", "away", canonical_team_name(away)}:
                away_win = probability

        outcomes = sorted_outcomes((home, home_win), draw, (away, away_win))
        edge = outcomes[0]["probability"] - outcomes[1]["probability"] if len(outcomes) > 1 else None
        if not outcomes:
            return provider_stub("sportmonks", "Sportmonks", True, "Sportmonks did not return a 1X2 market.")

        return {
            "id": "sportmonks",
            "name": "Sportmonks",
            "configured": True,
            "available": True,
            "homeWin": home_win,
            "draw": draw,
            "awayWin": away_win,
            "pick": outcomes[0]["label"],
            "confidence": confidence_label(edge),
            "message": "",
            "market": ((winner_market or {}).get("type") or {}).get("name") or "1X2",
        }

    return cached_loader(cache_key, MATCH_ODDS_CACHE_SECONDS, loader)


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
        "cape verde islands": "cape verde",
        "congo dr": "dr congo",
        "democratic republic of congo": "dr congo",
        "drc": "dr congo",
        "south korea": "south korea",
        "korea republic": "south korea",
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


def confidence_label(edge):
    if edge is None:
        return "pending"
    if edge >= 15:
        return "strong"
    if edge >= 7:
        return "balanced"
    return "tight"


def average_probability(values):
    numbers = [value for value in values if isinstance(value, (int, float))]
    if not numbers:
        return None
    return sum(numbers) / len(numbers)


def sorted_outcomes(home, draw, away):
    items = [
        {"key": "home", "label": home[0], "probability": home[1]},
        {"key": "draw", "label": "Draw", "probability": draw},
        {"key": "away", "label": away[0], "probability": away[1]},
    ]
    items = [item for item in items if isinstance(item["probability"], (int, float))]
    return sorted(items, key=lambda item: item["probability"], reverse=True)


def consensus_from_providers(home, away, providers):
    available = [provider for provider in providers if provider.get("available")]
    home_win = average_probability([provider.get("homeWin") for provider in available])
    draw = average_probability([provider.get("draw") for provider in available])
    away_win = average_probability([provider.get("awayWin") for provider in available])
    outcomes = sorted_outcomes((home, home_win), draw, (away, away_win))
    pick = outcomes[0]["label"] if outcomes else None
    edge = outcomes[0]["probability"] - outcomes[1]["probability"] if len(outcomes) > 1 else None

    picks = [provider.get("pick") for provider in available if provider.get("pick")]
    if not picks:
        agreement = "pending"
    elif len(set(picks)) == 1:
        agreement = "aligned"
    elif len(set(picks)) < len(picks):
        agreement = "partial"
    else:
        agreement = "split"

    return {
        "pick": pick,
        "confidence": confidence_label(edge),
        "agreement": agreement,
        "providerCount": len(available),
        "probabilities": {
            "homeWin": round(home_win, 1) if isinstance(home_win, (int, float)) else None,
            "draw": round(draw, 1) if isinstance(draw, (int, float)) else None,
            "awayWin": round(away_win, 1) if isinstance(away_win, (int, float)) else None,
        },
    }


def provider_stub(provider_id, name, configured, message):
    return {
        "id": provider_id,
        "name": name,
        "configured": configured,
        "available": False,
        "homeWin": None,
        "draw": None,
        "awayWin": None,
        "pick": None,
        "confidence": "pending",
        "message": message,
    }


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
                "eloPrediction": sample_elo_prediction("Mexico", "South Africa", 1730, 1564, 15, 57),
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
                "eloPrediction": sample_elo_prediction("Canada", "Qatar", 1722, 1588, 17, 51),
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
        "news": fallback_news_links(),
    }


def sample_elo_prediction(home, away, home_rating, away_rating, home_rank, away_rank):
    home_expected = 1 / (1 + pow(10, (away_rating - home_rating) / 400))
    away_expected = 1 - home_expected
    home_chance = round(home_expected * 100, 1)
    away_chance = round(away_expected * 100, 1)
    predicted_result = "home_win" if home_expected >= away_expected else "away_win"
    predicted_winner = home if predicted_result == "home_win" else away
    return {
        "formula": "1 / (1 + 10^((opponent_rating - team_rating) / 400))",
        "home": {"team": home, "code": "", "rank": home_rank, "rating": home_rating},
        "away": {"team": away, "code": "", "rank": away_rank, "rating": away_rating},
        "homeChance": home_chance,
        "awayChance": away_chance,
        "lean": predicted_winner,
        "predictedResult": predicted_result,
        "predictedWinner": predicted_winner,
        "resultLabel": f"{predicted_winner} win",
        "edge": round(abs(home_chance - away_chance), 1),
        "ratingDiff": home_rating - away_rating,
        "source": "World Football Elo Ratings",
    }


def fallback_news_links():
    return [
        {
            "title": "FIFA World Cup news",
            "source": "FIFA",
            "url": "https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026/articles",
            "category": "Official",
            "publishedAt": "",
            "summary": "Official tournament news, announcements, host-city updates, and competition features.",
        },
        {
            "title": "World Cup 2026 news search",
            "source": "Google News",
            "url": "https://news.google.com/search?q=FIFA%20World%20Cup%202026",
            "category": "Latest",
            "publishedAt": "",
            "summary": "A live search page for current World Cup headlines from multiple publishers.",
        },
        {
            "title": "AP FIFA World Cup coverage",
            "source": "Associated Press",
            "url": "https://apnews.com/hub/fifa-world-cup",
            "category": "Global",
            "publishedAt": "",
            "summary": "Independent reporting and background coverage on World Cup teams, venues, and fixtures.",
        },
        {
            "title": "BBC World Cup coverage",
            "source": "BBC Sport",
            "url": "https://www.bbc.com/sport/football/world-cup",
            "category": "Global",
            "publishedAt": "",
            "summary": "News, analysis, and match coverage from BBC Sport.",
        },
    ]


def worldcup_news_get():
    def loader():
        query = urllib.parse.urlencode(
            {
                "q": "FIFA World Cup 2026",
                "hl": "en-US",
                "gl": "US",
                "ceid": "US:en",
            }
        )
        url = f"https://news.google.com/rss/search?{query}"
        request = urllib.request.Request(
            url,
            headers={
                "Accept": "application/rss+xml, application/xml;q=0.9, */*;q=0.8",
                "User-Agent": "WorldCupPredictionDashboard/1.0",
            },
        )

        with urllib.request.urlopen(request, timeout=12) as response:
            rss_xml = response.read().decode("utf-8", "ignore")
        return parse_news_rss(rss_xml)

    try:
        items = cached_loader("news:worldcup", NEWS_CACHE_SECONDS, loader)
    except Exception:
        return fallback_news_links()

    if not items:
        return fallback_news_links()
    return items


def parse_news_rss(rss_xml):
    root = ElementTree.fromstring(rss_xml)
    items = []
    for item in root.findall(".//channel/item")[:12]:
        raw_title = clean_text(item.findtext("title"))
        source = clean_text(item.findtext("source"))
        title = raw_title
        if source and raw_title.endswith(f" - {source}"):
            title = raw_title[: -(len(source) + 3)].strip()

        published_at = format_news_date(item.findtext("pubDate"))
        summary = clean_news_summary(item.findtext("description"))
        items.append(
            {
                "title": title or "World Cup news",
                "source": source or "Google News",
                "url": item.findtext("link") or "https://news.google.com/search?q=FIFA%20World%20Cup%202026",
                "category": news_category(title, summary),
                "publishedAt": published_at,
                "summary": summary,
            }
        )
    return items


def clean_text(value):
    return html.unescape(str(value or "")).strip()


def clean_news_summary(value):
    text = re.sub(r"<[^>]+>", " ", clean_text(value))
    text = re.sub(r"\s+", " ", text).strip()
    if len(text) > 180:
        return f"{text[:177].rsplit(' ', 1)[0]}..."
    return text


def format_news_date(value):
    try:
        parsed = parsedate_to_datetime(value)
    except (TypeError, ValueError):
        return ""
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def news_category(title, summary):
    text = f"{title} {summary}".lower()
    if any(keyword in text for keyword in ("draw", "group", "schedule", "fixture")):
        return "Schedule"
    if any(keyword in text for keyword in ("qualif", "playoff", "play-off", "team", "squad", "roster")):
        return "Teams"
    if any(keyword in text for keyword in ("venue", "stadium", "host", "ticket", "fan")):
        return "Host Cities"
    if any(keyword in text for keyword in ("fifa", "official", "president")):
        return "Official"
    return "Latest"


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
    forecast_matches = []
    odds_predictions = odds_api_get_match_predictions()
    elo_ratings = elo_ratings_get()
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
            forecast_matches.append(
                {
                    "homeTeam": {"name": home_name},
                    "awayTeam": {"name": away_name},
                    "utcDate": fixture.get("starting_at"),
                    "status": state.get("short_name") or state.get("name") or "SCHEDULED",
                }
            )

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
        "forecasts": build_forecasts_from_matches(forecast_matches, odds_predictions, None, elo_ratings),
        "championOdds": odds_api_get_champion() or sample_dashboard()["championOdds"],
        "news": worldcup_news_get(),
    }


def normalize_group_name(group):
    if not group:
        return ""
    return str(group).replace("_", " ").title()


def normalized_from_football_data():
    standings_payload = football_data_get("/competitions/WC/standings")
    matches_payload = football_data_get("/competitions/WC/matches")
    matches = matches_payload.get("matches", [])
    odds_predictions = odds_api_get_match_predictions()
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
        "forecasts": build_forecasts_from_matches(matches, odds_predictions, None, elo_ratings),
        "championOdds": odds_api_get_champion() or sample_dashboard()["championOdds"],
        "news": worldcup_news_get(),
    }


def parse_utc(value):
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def build_forecasts_from_matches(matches, odds_predictions, sheet_predictions=None, elo_ratings=None):
    elo_ratings = elo_ratings or {}
    upcoming_statuses = {"SCHEDULED", "TIMED", "IN_PLAY", "PAUSED", "NS", "LIVE", "HT", "1H", "2H"}
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
        sportmonks_prediction = sportmonks_prediction_for_match(home, away, match.get("utcDate"))
        api_football_prediction = api_football_prediction_for_match(home, away, match.get("utcDate"))
        elo_prediction = elo_prediction_for_match(home, away, elo_ratings)
        odds_provider = provider_stub(
            "the-odds-api",
            "The Odds API",
            bool(os.environ.get("ODDS_API_KEY")),
            "The Odds API did not return a matching h2h market for this fixture." if os.environ.get("ODDS_API_KEY") else "ODDS_API_KEY is not configured.",
        )

        home_win = odds.get(home)
        away_win = odds.get(away)
        draw = odds.get("Draw")
        if any(value is not None for value in (home_win, draw, away_win)):
            outcomes = sorted_outcomes((home, home_win), draw, (away, away_win))
            edge = outcomes[0]["probability"] - outcomes[1]["probability"] if len(outcomes) > 1 else None
            odds_provider = {
                "id": "the-odds-api",
                "name": "The Odds API",
                "configured": True,
                "available": True,
                "homeWin": round(home_win, 1) if home_win is not None else None,
                "draw": round(draw, 1) if draw is not None else None,
                "awayWin": round(away_win, 1) if away_win is not None else None,
                "pick": outcomes[0]["label"] if outcomes else None,
                "confidence": confidence_label(edge),
                "message": "",
            }

        providers = [sportmonks_prediction, api_football_prediction, odds_provider]
        consensus = consensus_from_providers(home, away, providers)

        forecasts.append(
            {
                "match": f"{home} vs {away}",
                "home": home,
                "away": away,
                "homeWin": consensus["probabilities"]["homeWin"],
                "draw": consensus["probabilities"]["draw"],
                "awayWin": consensus["probabilities"]["awayWin"],
                "kickoff": match.get("utcDate"),
                "status": match.get("status", "SCHEDULED"),
                "source": " + ".join([provider["name"] for provider in providers if provider.get("available")]) or "fixture",
                "predictionStatus": prediction_status_for_match(match, providers),
                "providerForecasts": providers,
                "consensus": consensus,
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
    home_chance = round(home_expected * 100, 1)
    away_chance = round(away_expected * 100, 1)
    if home_expected > away_expected:
        predicted_result = "home_win"
        predicted_winner = home
        result_label = f"{home} win"
    elif away_expected > home_expected:
        predicted_result = "away_win"
        predicted_winner = away
        result_label = f"{away} win"
    else:
        predicted_result = "draw"
        predicted_winner = "Draw"
        result_label = "Draw"

    return {
        "formula": "1 / (1 + 10^((opponent_rating - team_rating) / 400))",
        "home": home_elo,
        "away": away_elo,
        "homeChance": home_chance,
        "awayChance": away_chance,
        "lean": home if home_expected >= away_expected else away,
        "predictedResult": predicted_result,
        "predictedWinner": predicted_winner,
        "resultLabel": result_label,
        "edge": round(abs(home_chance - away_chance), 1),
        "ratingDiff": home_elo["rating"] - away_elo["rating"],
        "source": "World Football Elo Ratings",
    }


def prediction_status_for_match(match, providers):
    available = [provider for provider in providers if provider.get("available")]
    if available:
        return ""

    missing = [provider["name"] for provider in providers if not provider.get("configured")]
    if missing:
        return f"Configure {', '.join(missing)} to show multi-source probabilities."

    unavailable = [provider.get("message") for provider in providers if provider.get("message")]
    if unavailable:
        return unavailable[0]

    return "Prediction providers did not return a matching market for this fixture."


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


def refresh_odds_payload():
    cache_delete_prefix("odds:")
    cache_delete_prefix("dashboard")
    match_predictions = odds_api_get_match_predictions()
    champion_odds = odds_api_get_champion()
    return {
        "ok": True,
        "updatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "matches": len(match_predictions),
        "championOdds": len(champion_odds),
        "message": "Odds refreshed from The Odds API.",
    }


class Handler(BaseHTTPRequestHandler):
    def send_common_headers(self):
        self.send_header("Cache-Control", "no-store")
        self.send_header("Referrer-Policy", "strict-origin-when-cross-origin")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Permissions-Policy", "geolocation=(), microphone=(), camera=()")
        self.send_header(
            "Content-Security-Policy",
            "default-src 'self'; "
            "script-src 'self'; "
            "style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data: https:; "
            "connect-src 'self'; "
            "font-src 'self' data:; "
            "object-src 'none'; "
            "base-uri 'self'; "
            "frame-ancestors 'none'"
        )

    def do_HEAD(self):
        parsed = urllib.parse.urlparse(self.path)
        path = "/index.html" if parsed.path == "/" else parsed.path
        file_path = (PUBLIC / path.lstrip("/")).resolve()

        if not str(file_path).startswith(str(PUBLIC.resolve())) or not file_path.exists():
            self.send_error(404)
            return

        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_common_headers()
        self.send_header("Content-Length", str(file_path.stat().st_size))
        self.end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        if path == "/health":
            self.send_json({"ok": True, "service": "world-cup-prediction"})
            return

        if path == "/api/dashboard":
            self.send_json(dashboard_payload())
            return

        if path == "/api/refresh-elo":
            self.send_json(refresh_elo_payload())
            return

        if path == "/api/refresh-odds":
            self.send_json(refresh_odds_payload())
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
        self.send_common_headers()
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def send_json(self, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_common_headers()
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
