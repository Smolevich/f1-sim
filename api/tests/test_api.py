import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("F1SIM_DB", str(tmp_path / "api.db"))
    monkeypatch.setenv("F1SIM_IP_SALT", "test-salt")
    import importlib

    from app import main as main_module
    importlib.reload(main_module)
    return TestClient(main_module.app)


def valid_lap():
    return {
        "track": "monza", "name": "STAS", "time_ms": 100_000,
        "sectors": [33_000, 34_000, 33_000], "assists": [],
    }


def test_empty_leaderboard_returns_no_entries(client):
    assert client.get("/api/leaderboard?track=monza").json()["entries"] == []


def test_valid_lap_accepted_and_listed(client):
    assert client.post("/api/leaderboard", json=valid_lap()).json()["accepted"] is True
    entries = client.get("/api/leaderboard?track=monza").json()["entries"]
    assert entries[0]["name"] == "STAS"


def test_impossible_lap_rejected(client):
    payload = valid_lap() | {"time_ms": 40_000, "sectors": [13_000, 14_000, 13_000]}
    body = client.post("/api/leaderboard", json=payload).json()
    assert body["accepted"] is False
    assert body["reason"]


def test_unknown_track_rejected(client):
    body = client.post("/api/leaderboard", json=valid_lap() | {"track": "нетакой"}).json()
    assert body["accepted"] is False


def test_top_capped_at_five(client):
    for i in range(8):
        client.post("/api/leaderboard", json=valid_lap() | {
            "name": f"P{i}", "time_ms": 100_000 + i * 1000,
            "sectors": [33_000 + i * 1000, 34_000, 33_000],
        })
    assert len(client.get("/api/leaderboard?track=monza").json()["entries"]) <= 5


def test_overlong_name_rejected_by_schema(client):
    r = client.post("/api/leaderboard", json=valid_lap() | {"name": "X" * 50})
    assert r.status_code == 422


def test_name_is_sanitized_server_side(client):
    client.post("/api/leaderboard", json=valid_lap() | {"name": "<script>x"})
    name = client.get("/api/leaderboard?track=monza").json()["entries"][0]["name"]
    assert "<" not in name and ">" not in name


def test_empty_name_becomes_anon(client):
    client.post("/api/leaderboard", json=valid_lap() | {"name": "   "})
    assert client.get("/api/leaderboard?track=monza").json()["entries"][0]["name"] == "ANON"


def test_rejected_attempts_count_toward_the_rate_limit(client):
    impossible = valid_lap() | {"time_ms": 40_000, "sectors": [13_000, 14_000, 13_000]}
    for _ in range(61):
        client.post("/api/leaderboard", json=impossible)
    body = client.post("/api/leaderboard", json=valid_lap()).json()
    assert body["accepted"] is False
    assert "слишком много" in body["reason"]
