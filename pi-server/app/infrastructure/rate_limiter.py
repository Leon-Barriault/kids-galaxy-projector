"""
In-memory per-client cooldown.

The clock is injected so behaviour is deterministic under test. Entries are
evicted once stale, so a long event with many tablets cannot grow the map
without bound.
"""

import time
from collections.abc import Callable

from app.domain.errors import RateLimitedError
from app.ports import RateLimiter

DEFAULT_MAX_ENTRIES = 1024


class InMemoryRateLimiter(RateLimiter):
    def __init__(
        self,
        cooldown_seconds: float,
        clock: Callable[[], float] = time.time,
        max_entries: int = DEFAULT_MAX_ENTRIES,
    ):
        self._cooldown = cooldown_seconds
        self._clock = clock
        self._max_entries = max_entries
        self._last_seen: dict[str, float] = {}

    @property
    def tracked_clients(self) -> int:
        return len(self._last_seen)

    def check(self, key: str) -> None:
        now = self._clock()
        last = self._last_seen.get(key)

        if last is not None and now - last < self._cooldown:
            # Deliberately do NOT refresh the timestamp: a rejected attempt must
            # not extend the window and lock an impatient child out indefinitely.
            raise RateLimitedError()

        self._last_seen[key] = now
        self._evict_stale(now)

    def _evict_stale(self, now: float) -> None:
        if len(self._last_seen) <= self._max_entries:
            return
        cutoff = now - self._cooldown
        self._last_seen = {k: t for k, t in self._last_seen.items() if t > cutoff}
        # Still oversized (many active clients): drop the oldest entries.
        if len(self._last_seen) > self._max_entries:
            ordered = sorted(self._last_seen.items(), key=lambda kv: kv[1], reverse=True)
            self._last_seen = dict(ordered[: self._max_entries])
