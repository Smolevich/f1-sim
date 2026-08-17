"""API leaderboard: топ-5 на трассу и приём результатов."""

import hashlib
import os
from pathlib import Path

from fastapi import FastAPI, Request
from pydantic import BaseModel, Field

from app.attempts import AttemptCounter
from app.limits import TRACK_LIMITS
from app.storage import Lap, Storage
from app.validation import validate_lap

DB_PATH = Path(os.environ.get("F1SIM_DB", "/opt/f1-sim/data/leaderboard.db"))
# Соль читается из окружения (в прод её кладёт деплой из Vault): без неё хеш IP
# сводится к перебору, а сам IP хранить не хочется.
IP_SALT = os.environ.get("F1SIM_IP_SALT", "dev-salt")
RATE_LIMIT_PER_HOUR = 60
NAME_LIMIT = 12
TOP_LIMIT = 5

app = FastAPI(title="f1-sim leaderboard")
storage = Storage(DB_PATH)
attempts = AttemptCounter(window_seconds=3600)


class LapPayload(BaseModel):
    track: str = Field(max_length=32)
    name: str = Field(max_length=12)
    time_ms: int
    sectors: list[int]
    assists: list[str] = Field(default_factory=list, max_length=8)


def hash_ip(ip: str) -> str:
    return hashlib.sha256(f"{IP_SALT}:{ip}".encode()).hexdigest()[:32]


def client_ip(request: Request) -> str:
    """
    Адрес берётся из X-Real-IP, который проставляет наш же nginx, а не из
    CF-Connecting-IP: последний приходит от клиента и подделывается, а nginx его
    не перезаписывает — с ним лимит обходится сменой одного заголовка.
    """
    return request.headers.get("x-real-ip") or (request.client.host if request.client else "")


def clean_name(raw: str) -> str:
    """
    Имя чистится на сервере, а не только в браузере: эндпоинт публичный, и клиент
    не является границей доверия. Пустое имя после чистки заменяется на ANON.
    """
    cleaned = "".join(c for c in raw if c.isprintable() and c not in '<>"\'&\\').strip()
    return cleaned[:NAME_LIMIT] if cleaned else "ANON"


@app.get("/api/leaderboard")
def get_top(track: str) -> dict[str, object]:
    return {"entries": storage.top(track, TOP_LIMIT)}


@app.post("/api/leaderboard")
def post_lap(payload: LapPayload, request: Request) -> dict[str, object]:
    ip_hash = hash_ip(client_ip(request))

    # Лимит считает попытки, а не записи: если считать только принятые круги,
    # перебор в поисках границы валидации ничем не ограничен.
    attempts.hit(ip_hash)
    if attempts.count(ip_hash) > RATE_LIMIT_PER_HOUR:
        return {"accepted": False, "reason": "слишком много заездов за час"}

    reason = validate_lap(TRACK_LIMITS.get(payload.track), payload.model_dump())
    if reason is not None:
        return {"accepted": False, "reason": reason}

    storage.insert(Lap(
        track=payload.track, name=clean_name(payload.name), time_ms=payload.time_ms,
        sectors=payload.sectors, assists=payload.assists, ip_hash=ip_hash,
    ))
    return {"accepted": True, "reason": None}
