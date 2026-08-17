import pytest

from app.storage import Lap, Storage


@pytest.fixture
def storage(tmp_path):
    return Storage(tmp_path / "test.db")


def lap(**over):
    base = dict(track="monza", name="STAS", time_ms=84_000,
                sectors=[28_000, 28_000, 28_000], assists=[], ip_hash="h")
    base.update(over)
    return Lap(**base)


def test_inserted_lap_appears_in_top(storage):
    storage.insert(lap())
    top = storage.top("monza", 5)
    assert len(top) == 1
    assert top[0]["name"] == "STAS"


def test_top_sorted_by_time(storage):
    storage.insert(lap(name="SLOW", time_ms=90_000))
    storage.insert(lap(name="FAST", time_ms=82_000))
    assert [e["name"] for e in storage.top("monza", 5)] == ["FAST", "SLOW"]


def test_top_limited_to_five(storage):
    for i in range(9):
        storage.insert(lap(name=f"P{i}", time_ms=80_000 + i * 1000))
    assert len(storage.top("monza", 5)) == 5


def test_tracks_are_isolated(storage):
    storage.insert(lap(track="monza"))
    assert storage.top("spa", 5) == []


def test_recent_count_by_ip_hash(storage):
    storage.insert(lap(ip_hash="abc"))
    storage.insert(lap(ip_hash="abc"))
    assert storage.count_recent("abc", 3600) == 2
    assert storage.count_recent("other", 3600) == 0
