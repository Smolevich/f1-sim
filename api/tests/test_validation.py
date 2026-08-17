from app.validation import TrackLimits, validate_lap

MONZA = TrackLimits(sim_record_ms=80_000, sim_sectors_ms=(26_000, 27_000, 27_000))


def payload(**over):
    base = {
        "track": "monza",
        "name": "STAS",
        "time_ms": 84_000,
        "sectors": [28_000, 28_000, 28_000],
        "assists": [],
    }
    base.update(over)
    return base


def test_valid_lap_accepted():
    assert validate_lap(MONZA, payload()) is None


def test_lap_faster_than_sim_record_rejected():
    reason = validate_lap(MONZA, payload(time_ms=70_000, sectors=[23_000, 23_000, 24_000]))
    assert reason is not None and "быстрее" in reason


def test_lap_within_two_percent_of_record_accepted():
    # Запас 2% проверяется у круга И у каждого сектора: 80000*0.98=78400,
    # 26000*0.98=25480, 27000*0.98=26460. Значения взяты чуть выше каждой
    # планки, а сумма секторов равна времени круга.
    assert validate_lap(MONZA, payload(time_ms=78_460,
                                       sectors=[25_500, 26_480, 26_480])) is None


def test_sector_faster_than_sim_sector_rejected():
    reason = validate_lap(MONZA, payload(sectors=[20_000, 32_000, 32_000]))
    assert reason is not None and "сектор" in reason.lower()


def test_sectors_not_summing_to_lap_rejected():
    # Секторы должны сами проходить проверку планки, иначе сработает более
    # ранняя проверка секторов, а не проверка суммы, которую тест целится проверить.
    reason = validate_lap(MONZA, payload(time_ms=84_000, sectors=[27_000, 28_000, 28_000]))
    assert reason is not None and "сумма" in reason.lower()


def test_wrong_sector_count_rejected():
    assert validate_lap(MONZA, payload(sectors=[42_000, 42_000])) is not None


def test_nonpositive_time_rejected():
    assert validate_lap(MONZA, payload(time_ms=0)) is not None


def test_unknown_track_rejected():
    assert validate_lap(None, payload(track="нетакой")) is not None
