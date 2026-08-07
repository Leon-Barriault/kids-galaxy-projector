"""
Infrastructure: per-client cooldown.

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


class TestInMemoryRateLimiter:
    def test_first_request_is_allowed(self, limiter):
        limiter.check("10.0.0.1")  # must not raise

    def test_second_request_within_cooldown_is_denied(self, limiter, clock):
        limiter.check("10.0.0.1")
        clock.advance(2.9)
        with pytest.raises(RateLimitedError):
            limiter.check("10.0.0.1")

    def test_request_after_cooldown_is_allowed(self, limiter, clock):
        limiter.check("10.0.0.1")
        clock.advance(3.1)
        limiter.check("10.0.0.1")  # must not raise

    def test_clients_are_independent(self, limiter):
        limiter.check("10.0.0.1")
        limiter.check("10.0.0.2")  # different client, must not raise

    def test_denied_request_does_not_extend_the_window(self, limiter, clock):
        """A blocked attempt must not reset the cooldown and lock the child out."""
        limiter.check("10.0.0.1")
        clock.advance(2.0)
        with pytest.raises(RateLimitedError):
            limiter.check("10.0.0.1")
        clock.advance(1.1)  # 3.1s since the *successful* request
        limiter.check("10.0.0.1")  # must now be allowed

    def test_stale_entries_are_evicted(self, clock):
        """The map must not grow without bound over a long event."""
        limiter = InMemoryRateLimiter(cooldown_seconds=3, clock=clock, max_entries=5)
        for i in range(20):
            limiter.check(f"10.0.0.{i}")
            clock.advance(10)  # every entry becomes stale
        assert limiter.tracked_clients <= 5
