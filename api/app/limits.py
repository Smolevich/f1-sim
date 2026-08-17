"""Планки трасс: предел самой модели физики, не реальные рекорды."""

from app.validation import TrackLimits

# simRecord/simSector снимаются эталонным заездом и пересчитываются при любом
# изменении физики: иначе честные заезды начнут отклоняться.
TRACK_LIMITS: dict[str, TrackLimits] = {
    "monza": TrackLimits(sim_record_ms=95_000, sim_sectors_ms=(30_000, 32_000, 30_000)),
}
