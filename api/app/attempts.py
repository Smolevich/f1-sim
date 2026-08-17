"""Счётчик попыток отправки в скользящем окне."""

import time
from collections import defaultdict
from collections.abc import Callable

type Clock = Callable[[], float]


class AttemptCounter:
    """
    Считает ВСЕ попытки, включая отклонённые: лимит по числу записей в базе
    ограничивал бы только успешные вставки, оставляя перебор границы валидации
    без ограничения.

    Держится в памяти процесса: перезапуск сервиса счётчик обнуляет. Это
    осознанно — единственный процесс, единственная машина, и цена промаха здесь
    несопоставима со сложностью персистентного лимитера.
    """

    def __init__(self, window_seconds: int, clock: Clock = time.monotonic) -> None:
        self.window_seconds = window_seconds
        self.clock = clock
        self.hits: dict[str, list[float]] = defaultdict(list)

    def hit(self, key: str) -> None:
        now = self.clock()
        self.prune(key, now)
        self.hits[key].append(now)

    def count(self, key: str) -> int:
        self.prune(key, self.clock())
        return len(self.hits[key])

    def prune(self, key: str, now: float) -> None:
        cutoff = now - self.window_seconds
        fresh = [t for t in self.hits[key] if t > cutoff]
        if fresh:
            self.hits[key] = fresh
        else:
            self.hits.pop(key, None)
