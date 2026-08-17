"""Правила приёма результата круга. Чистые функции, без базы и сети."""

from dataclasses import dataclass

type Payload = dict[str, object]

# Эталонный круг — не абсолютный оптимум: живой игрок находит траекторию лучше.
# Планка отсекает физически невозможное, а не выдающееся.
TOLERANCE = 0.02
# Сумма секторов и время круга считаются на клиенте по одному и тому же часам,
# поэтому расходиться могут только на округление кадра.
SUM_TOLERANCE_MS = 50


@dataclass(frozen=True)
class TrackLimits:
    """Предел самой модели физики на этой трассе, не реальный рекорд."""

    sim_record_ms: int
    sim_sectors_ms: tuple[int, int, int]


def validate_lap(limits: TrackLimits | None, payload: Payload) -> str | None:
    """Причина отказа, либо None если круг принимается."""
    if limits is None:
        return "неизвестная трасса"

    time_ms = payload.get("time_ms")
    if not isinstance(time_ms, int) or time_ms <= 0:
        return "время круга должно быть положительным"

    sectors = payload.get("sectors")
    if not isinstance(sectors, list) or len(sectors) != 3:
        return "нужны ровно три сектора"
    if not all(isinstance(s, int) and s > 0 for s in sectors):
        return "секторы должны быть положительными"

    if time_ms < limits.sim_record_ms * (1 - TOLERANCE):
        return f"время {time_ms} мс быстрее предела модели {limits.sim_record_ms} мс"

    for i, (actual, limit) in enumerate(zip(sectors, limits.sim_sectors_ms), start=1):
        if actual < limit * (1 - TOLERANCE):
            return f"сектор {i}: {actual} мс быстрее предела {limit} мс"

    if abs(sum(sectors) - time_ms) > SUM_TOLERANCE_MS:
        return "сумма секторов не сходится со временем круга"

    return None
