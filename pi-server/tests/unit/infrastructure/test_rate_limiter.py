"""
Infrastructure: per-client cooldown.

Semantics (matching the intent of upstream commit 4ee2252):
- `check(key)` is a pure query - it raises if the client is still cooling down
  but never records anything.
- `record(key)` marks a *successful* upload.

Keeping these separate matters for a kids' app: if checking also marked, a
drawing rejected for being corrupt or oversized would still burn the child's
cooldown, making them wait before retrying something that was never stored.

Time is injected as a clock function, so these tests are deterministic and
instant - no sleeping, no patching of module internals.
"""

import pytest

from app.domain.errors import RateLimitedError
from app.infrastructure.rate_limiter import InMemoryRateLimiter


class FakeClock:
    def __init__(self, now=1000.0):
        self.now = now

    def __call__(self):
        return self.now

    def advance(self, seconds):
        self.now += seconds


@pytest.fixture
def clock():
    return FakeClock()


@pytest.fixture
def limiter(clock):
    return InMemoryRateLimiter(cooldown_seconds=3, clock=clock)


class TestCheckIsPure:
    def test_first_check_is_allowed(self, limiter):
        limiter.check("10.0.0.1")  # must not raise

    def test_check_does_not_record(self, limiter):
        """The whole point: checking twice in a row must still be allowed."""
        limiter.check("10.0.0.1")
        limiter.check("10.0.0.1")
        assert limiter.tracked_clients == 0

    def test_repeated_checks_never_start_a_cooldown(self, limiter, clock):
        for _ in range(5):
            limiter.check("10.0.0.1")
            clock.advance(0.1)


class TestRecordThenCheck:
    def test_check_within_cooldown_is_denied_after_record(self, limiter, clock):
        limiter.record("10.0.0.1")
        clock.advance(2.9)
        with pytest.raises(RateLimitedError):
            limiter.check("10.0.0.1")

    def test_check_after_cooldown_is_allowed(self, limiter, clock):
        limiter.record("10.0.0.1")
        clock.advance(3.1)
        limiter.check("10.0.0.1")  # must not raise

    def test_record_stores_the_timestamp(self, limiter, clock):
        limiter.record("10.0.0.1")
        assert limiter.tracked_clients == 1

    def test_clients_are_independent(self, limiter, clock):
        limiter.record("10.0.0.1")
        clock.advance(0.5)
        limiter.check("10.0.0.2")  # a different client is unaffected
        with pytest.raises(RateLimitedError):
            limiter.check("10.0.0.1")

    def test_denied_check_does_not_extend_the_window(self, limiter, clock):
        """A blocked attempt must not reset the cooldown and lock the child out."""
        limiter.record("10.0.0.1")
        clock.advance(2.0)
        with pytest.raises(RateLimitedError):
            limiter.check("10.0.0.1")

        clock.advance(1.1)  # 3.1s since the successful upload
        limiter.check("10.0.0.1")  # must now be allowed


class TestEviction:
    def test_stale_entries_are_evicted(self, clock):
        """The map must not grow without bound over a long event."""
        limiter = InMemoryRateLimiter(cooldown_seconds=3, clock=clock, max_entries=5)
        for i in range(20):
            limiter.record(f"10.0.0.{i}")
            clock.advance(10)  # every entry becomes stale
        assert limiter.tracked_clients <= 5

    def test_active_clients_are_kept_when_over_capacity(self, clock):
        limiter = InMemoryRateLimiter(cooldown_seconds=60, clock=clock, max_entries=3)
        for i in range(10):
            limiter.record(f"10.0.0.{i}")
            clock.advance(0.1)
        # Oversized but all still active: the newest entries win.
        assert limiter.tracked_clients <= 3
        with pytest.raises(RateLimitedError):
            limiter.check("10.0.0.9")  # most recent must still be throttled
