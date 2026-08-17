"""API leaderboard: топ-5 на трассу и приём результатов."""

import hashlib
import os
from pathlib import Path

from fastapi import FastAPI, Request
from pydantic import BaseModel, Field

from app.limits import TRACK_LIMITS
from app.storage import Lap, Storage
from app.validation import validate_lap

DB_PATH = Path(os.environ.get("F1SIM_DB", "/opt/f1-sim/data/leaderboard.db"))
# Соль читается из окружения (в прод её кладёт деплой из Vault): без неё хеш IP
# сводится к перебору, а сам IP хранить не хочется.
IP_SALT = os.environ.get("F1SIM_IP_SALT", "dev-salt")
RATE_LIMIT_PER_HOUR = 60
TOP_LIMIT = 5

app = FastAPI(title="f1-sim leaderboard")
storage = Storage(DB_PATH)


class LapPayload(BaseModel):
    track: str = Field(max_length=32)
    name: str = Field(max_length=12)
    time_ms: int
    sectors: list[int]
    assists: list[str] = Field(default_factory=list, max_length=8)


def hash_ip(ip: str) -> str:
    return hashlib.sha256(f"{IP_SALT}:{ip}".encode()).hexdigest()[:32]


@app.get("/api/leaderboard")
def get_top(track: str) -> dict[str, object]:
    return {"entries": storage.top(track, TOP_LIMIT)}


@app.post("/api/leaderboard")
def post_lap(payload: LapPayload, request: Request) -> dict[str, object]:
    ip = request.headers.get("cf-connecting-ip") or (request.client.host if request.client else "")
    ip_hash = hash_ip(ip)

    if storage.count_recent(ip_hash, 3600) >= RATE_LIMIT_PER_HOUR:
        return {"accepted": False, "reason": "слишком много заездов за час"}

    reason = validate_lap(TRACK_LIMITS.get(payload.track), payload.model_dump())
    if reason is not None:
        return {"accepted": False, "reason": reason}

    storage.insert(Lap(
        track=payload.track, name=payload.name, time_ms=payload.time_ms,
        sectors=payload.sectors, assists=payload.assists, ip_hash=ip_hash,
    ))
    return {"accepted": True, "reason": None}
