"""SQLite-хранилище результатов. Схема создаётся при первом обращении."""

import json
import sqlite3
import time
from dataclasses import dataclass
from pathlib import Path

SCHEMA = """
CREATE TABLE IF NOT EXISTS laps (
  id INTEGER PRIMARY KEY,
  track TEXT NOT NULL,
  name TEXT NOT NULL,
  time_ms INTEGER NOT NULL,
  sectors TEXT NOT NULL,
  assists TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  ip_hash TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS laps_track_time ON laps (track, time_ms);
CREATE INDEX IF NOT EXISTS laps_ip_created ON laps (ip_hash, created_at);
"""


@dataclass(frozen=True)
class Lap:
    track: str
    name: str
    time_ms: int
    sectors: list[int]
    assists: list[str]
    ip_hash: str


class Storage:
    def __init__(self, path: Path) -> None:
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self._connect() as conn:
            conn.executescript(SCHEMA)

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.path)
        conn.row_factory = sqlite3.Row
        return conn

    def insert(self, lap: Lap) -> None:
        with self._connect() as conn:
            conn.execute(
                "INSERT INTO laps (track, name, time_ms, sectors, assists, created_at, ip_hash)"
                " VALUES (?, ?, ?, ?, ?, ?, ?)",
                (lap.track, lap.name, lap.time_ms, json.dumps(lap.sectors),
                 json.dumps(lap.assists), int(time.time()), lap.ip_hash),
            )

    def top(self, track: str, limit: int) -> list[dict[str, object]]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT name, time_ms, assists FROM laps WHERE track = ?"
                " ORDER BY time_ms ASC LIMIT ?",
                (track, limit),
            ).fetchall()
        return [
            {"name": r["name"], "time_ms": r["time_ms"], "assists": json.loads(r["assists"])}
            for r in rows
        ]

    def count_recent(self, ip_hash: str, seconds: int) -> int:
        since = int(time.time()) - seconds
        with self._connect() as conn:
            row = conn.execute(
                "SELECT COUNT(*) AS n FROM laps WHERE ip_hash = ? AND created_at >= ?",
                (ip_hash, since),
            ).fetchone()
        return int(row["n"])
