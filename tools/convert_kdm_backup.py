"""Convert KDM's exported database JSON into a Gully Scorer backup."""

from __future__ import annotations

import argparse
import json
import re
import sqlite3
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def number(value: Any, default: int = 0) -> int:
    try:
        return int(float(value or 0))
    except (TypeError, ValueError):
        return default


def is_deleted(row: dict[str, Any]) -> bool:
    return number(row.get("isDeleted")) == 1


def player_name(players: dict[str, str], player_id: Any) -> str:
    return players.get(str(player_id), str(player_id or "Unknown player"))


def safe_date(value: Any) -> str:
    if isinstance(value, (int, float)) or (isinstance(value, str) and value.isdigit()):
        timestamp = float(value) / 1000
        return datetime.fromtimestamp(timestamp, timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    text = str(value or "")
    return re.sub(r"\.(\d{3})\d+(Z|[+-])", r".\1\2", text)


def empty_score() -> dict[str, Any]:
    return {
        "runs": 0,
        "wickets": 0,
        "balls": 0,
        "striker": {"name": "", "runs": 0, "balls": 0, "fours": 0, "sixes": 0, "out": False},
        "nonStriker": {"name": "", "runs": 0, "balls": 0, "fours": 0, "sixes": 0, "out": False},
        "bowler": {"name": "", "balls": 0, "runs": 0, "wickets": 0},
        "currentOver": [],
        "overHistory": [],
        "fallOfWickets": [],
        "target": None,
        "maxOvers": None,
        "partnership": None,
        "freeHit": False,
        "wicketStreak": 0,
        "dismissedBatters": [],
        "inningsComplete": True,
        "battingStats": [],
        "bowlerStats": [],
    }


def convert(database: dict[str, list[dict[str, Any]]]) -> dict[str, Any]:
    players = {
        str(row.get("documentId")): str(row.get("name") or "Unknown player")
        for row in database.get("Players", [])
        if not is_deleted(row)
    }
    teams = {
        str(row.get("documentId")): str(row.get("name") or row.get("documentId"))
        for row in database.get("Teams", [])
        if not is_deleted(row)
    }

    stat_to_inning: dict[str, str] = {}
    for row in database.get("PlayerIdAndStatIds", []) + database.get("Innings", []):
        stat_id = row.get("playerIdAndStatsId_statsId")
        inning_id = row.get("playerIdAndStatsId_referenceId")
        if stat_id and inning_id:
            stat_to_inning[str(stat_id)] = str(inning_id)

    innings_by_match: dict[str, list[dict[str, Any]]] = defaultdict(list)
    innings_by_id: dict[str, dict[str, Any]] = {}
    for row in database.get("Innings", []):
        if is_deleted(row) or not row.get("documentId"):
            continue
        inning_id = str(row["documentId"])
        innings_by_id[inning_id] = row
        innings_by_match[str(row.get("matchId"))].append(row)

    batting_by_inning: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in database.get("BattingStats", []):
        if is_deleted(row):
            continue
        inning_id = stat_to_inning.get(str(row.get("documentId")))
        if inning_id:
            batting_by_inning[inning_id].append(row)

    bowling_by_inning: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in database.get("BowlingStats", []):
        if is_deleted(row):
            continue
        inning_id = stat_to_inning.get(str(row.get("documentId")))
        if inning_id:
            bowling_by_inning[inning_id].append(row)

    def parse_wickets(val: Any) -> int:
        if isinstance(val, str) and not val.strip().isdigit():
            return len([w for w in val.split(",") if w.strip()])
        return number(val)

    def format_dismissal(w: dict[str, Any] | None, row: dict[str, Any]) -> str:
        out_type = number(w.get("outType") if w else row.get("outType"), -1)
        if out_type == 1:
            fielder = player_name(players, w.get("whoHelpedId")) if w and w.get("whoHelpedId") else None
            bowler = player_name(players, w.get("bowlerId")) if w and w.get("bowlerId") else None
            if fielder and bowler and fielder != bowler:
                return f"c {fielder} b {bowler}"
            elif bowler:
                return f"c & b {bowler}"
            elif fielder:
                return f"c {fielder}"
            return "Caught"
        elif out_type == 0:
            bowler = player_name(players, w.get("bowlerId")) if w and w.get("bowlerId") else None
            return f"b {bowler}" if bowler else "Bowled"
        elif out_type == 2:
            fielder = player_name(players, w.get("whoHelpedId")) if w and w.get("whoHelpedId") else None
            return f"run out ({fielder})" if fielder else "run out"
        elif out_type == 3:
            bowler = player_name(players, w.get("bowlerId")) if w and w.get("bowlerId") else None
            return f"lbw b {bowler}" if bowler else "lbw"
        elif out_type == 4:
            keeper = player_name(players, w.get("whoHelpedId")) if w and w.get("whoHelpedId") else None
            bowler = player_name(players, w.get("bowlerId")) if w and w.get("bowlerId") else None
            if keeper and bowler:
                return f"st {keeper} b {bowler}"
            elif keeper:
                return f"st {keeper}"
            elif bowler:
                return f"st b {bowler}"
            return "Stumped"
        elif out_type == 6:
            bowler = player_name(players, w.get("bowlerId")) if w and w.get("bowlerId") else None
            return f"hit wicket b {bowler}" if bowler else "hit wicket"
        elif out_type == 99:
            return "Retired Out"
        return "Out"

    wickets_by_inning: dict[str, list[dict[str, Any]]] = defaultdict(list)
    wickets_by_batting_id: dict[str, dict[str, Any]] = {}
    wickets_by_inning_batter: dict[tuple[str, str], dict[str, Any]] = {}
    for row in database.get("Wickets", []):
        if not is_deleted(row):
            if row.get("inningId"):
                wickets_by_inning[str(row["inningId"])].append(row)
            if row.get("battingStatId"):
                wickets_by_batting_id[str(row["battingStatId"])] = row
            if row.get("inningId") and row.get("outBatsmanId"):
                wickets_by_inning_batter[(str(row["inningId"]), str(row["outBatsmanId"]))] = row

    def make_innings(rows: list[dict[str, Any]], match: dict[str, Any]) -> list[dict[str, Any]]:
        result = []
        for inning in sorted(rows, key=lambda row: str(row.get("createdDate") or "")):
            inning_id = str(inning["documentId"])
            score = empty_score()
            score["runs"] = number(inning.get("runs"))
            score["maxOvers"] = number(inning.get("totalOvers") or inning.get("overs")) or number(match.get("overs")) or None

            batting = sorted(batting_by_inning[inning_id], key=lambda row: number(row.get("battingOrder"), 9999))
            for row in batting:
                out = number(row.get("isOut")) == 1
                batter = {
                    "name": player_name(players, row.get("playerId")),
                    "runs": number(row.get("runs")),
                    "balls": number(row.get("ballsFaced")),
                    "fours": number(row.get("noOfFours")),
                    "sixes": number(row.get("noOfSixes")),
                    "out": out,
                }
                if out:
                    w = wickets_by_batting_id.get(str(row.get("documentId"))) or wickets_by_inning_batter.get((inning_id, str(row.get("playerId"))))
                    batter["dismissal"] = format_dismissal(w, row)
                    score["dismissedBatters"].append(batter["name"])
                score["battingStats"].append(batter)

            bowlers = sorted(bowling_by_inning[inning_id], key=lambda row: number(row.get("bowlingOrder"), 9999))
            for row in bowlers:
                score["bowlerStats"].append({
                    "name": player_name(players, row.get("playerId")),
                    "balls": number(row.get("legalBalls") or row.get("balls")),
                    "runs": number(row.get("runs")),
                    "wickets": parse_wickets(row.get("wickets")),
                    "maidens": number(row.get("maidens")),
                    "wides": number(row.get("wides")),
                    "noBalls": number(row.get("noBalls")),
                    "dotBalls": number(row.get("noOfDots")),
                })

            score["wickets"] = len(wickets_by_inning[inning_id]) or sum(1 for batter in score["battingStats"] if batter["out"])
            score["balls"] = sum(number(row.get("ballsFaced")) for row in batting)
            score["striker"] = next((batter for batter in score["battingStats"] if batter["name"]), score["striker"])
            if len(score["battingStats"]) > 1:
                score["nonStriker"] = score["battingStats"][1]
            score["bowler"] = score["bowlerStats"][0] if score["bowlerStats"] else score["bowler"]
            for index, wicket in enumerate(sorted(wickets_by_inning[inning_id], key=lambda row: str(row.get("createdDate") or "")), 1):
                score["fallOfWickets"].append({
                    "wicket": index,
                    "score": number(wicket.get("runs")),
                    "batter": player_name(players, wicket.get("outBatsmanId")),
                    "dismissal": format_dismissal(wicket, wicket),
                })
            result.append((inning, score))
        return result

    completed = []
    for match in database.get("Matches", []):
        if is_deleted(match) or number(match.get("isFinished")) != 1:
            continue
        team_one = teams.get(str(match.get("teamOneId")), str(match.get("teamOneId") or "Team 1"))
        team_two = teams.get(str(match.get("teamTwoId")), str(match.get("teamTwoId") or "Team 2"))
        innings = make_innings(innings_by_match[str(match.get("documentId"))], match)
        if not innings:
            continue
        first = innings[0]
        second = innings[1] if len(innings) > 1 else (None, None)
        winner_id = str(match.get("whoWon") or "")
        winner = teams.get(winner_id, winner_id) or "Match Drawn"
        if number(match.get("isTie")) == 1 or winner not in (team_one, team_two):
            winner = "Match Drawn"
        first_batting_home = str(first[0].get("battingTeamId")) == str(match.get("teamOneId"))
        completed.append({
            "id": str(match.get("documentId")),
            "savedAt": safe_date(match.get("updatedDate") or match.get("createdDate") or datetime.now(timezone.utc).isoformat()),
            "teamOne": team_one,
            "teamTwo": team_two,
            "firstBattingHome": first_batting_home,
            "firstInningsScore": first[1],
            "secondInningsScore": second[1],
            "result": {"winner": winner, "margin": str(match.get("resultDescription") or "")},
        })
    completed.sort(key=lambda m: m["savedAt"], reverse=True)
    return {"active": None, "completed": completed}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path, help="full_database_export.json")
    parser.add_argument("output", type=Path, nargs="?", default=Path("gully-scorer-backup.json"))
    args = parser.parse_args()
    raw = args.input.read_bytes()
    if raw[:16] != b"{\"" and not raw.lstrip().startswith(b"{"):
        try:
            sqlite3.connect(str(args.input)).execute("select name from sqlite_master")
        except sqlite3.DatabaseError as error:
            raise SystemExit("The supplied file is encrypted SQLCipher data. Export it as JSON from the Android app first, then pass full_database_export.json.\n" + str(error))
    database = json.loads(raw.decode("utf-8"))
    payload = convert(database)
    args.output.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(f"Wrote {len(payload['completed'])} completed matches to {args.output}")


if __name__ == "__main__":
    main()