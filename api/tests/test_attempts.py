from app.attempts import AttemptCounter


class FakeClock:
    def __init__(self) -> None:
        self.now = 0.0

    def __call__(self) -> float:
        return self.now


def test_counts_hits_per_key():
    counter = AttemptCounter(window_seconds=3600, clock=FakeClock())
    counter.hit("a")
    counter.hit("a")
    assert counter.count("a") == 2


def test_keys_are_independent():
    counter = AttemptCounter(window_seconds=3600, clock=FakeClock())
    counter.hit("a")
    assert counter.count("b") == 0


def test_hits_expire_after_the_window():
    clock = FakeClock()
    counter = AttemptCounter(window_seconds=3600, clock=clock)
    counter.hit("a")
    clock.now = 3601
    assert counter.count("a") == 0


def test_hits_inside_the_window_survive():
    clock = FakeClock()
    counter = AttemptCounter(window_seconds=3600, clock=clock)
    counter.hit("a")
    clock.now = 3599
    assert counter.count("a") == 1
