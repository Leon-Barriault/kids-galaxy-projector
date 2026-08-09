"""
In-memory per-client cooldown.

`check` and `record` are deliberately separate operations:

* `check(key)` is a pure query - it raises when the client is still cooling down
  and never mutates state.
* `record(key)` marks a *successful* upload.

If checking also marked, a drawing rejected for being corrupt or oversized would
still start the cooldown, making a child wait before retrying something that was
never stored.

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
    """Simple in-process rate limiter suitable for a single-Pi deployment."""

    def __init__(
        self,
        cooldown_seconds: float,
        clock: Callable[[], float] = time.time,
        max_entries: int = DEFAULT_MAX_ENTRIES,
    ):
        """
        Args:
            cooldown_seconds: Minimum seconds between successful uploads for
                the same client key.
            clock: Injectable clock (defaults to time.time) for testing.
            max_entries: Soft ceiling on the number of tracked clients; older
                entries are evicted when the map grows beyond this size.
        """
        self._cooldown = cooldown_seconds
        self._clock = clock
        self._max_entries = max_entries
        self._last_upload: dict[str, float] = {}

    @property
    def tracked_clients(self) -> int:
        """Number of client keys currently held in memory (for diagnostics)."""
        return len(self._last_upload)

    def check(self, key: str) -> None:
        """Raise if `key` is still within its cooldown. Does not record."""
        last = self._last_upload.get(key)
        if last is not None and self._clock() - last < self._cooldown:
            raise RateLimitedError()

    def record(self, key: str) -> None:
        """Mark a successful upload, starting this client's cooldown."""
        now = self._clock()
        self._last_upload[key] = now
        self._evict_stale(now)

    def _evict_stale(self, now: float) -> None:
        """Drop entries that can no longer affect a future check."""
        if len(self._last_upload) <= self._max_entries:
            return

        cutoff = now - self._cooldown
        self._last_upload = {k: t for k, t in self._last_upload.items() if t > cutoff}

        # Still oversized (many genuinely active clients): keep the newest.
        if len(self._last_upload) > self._max_entries:
            newest = sorted(
                self._last_upload.items(), key=lambda kv: kv[1], reverse=True
            )
            self._last_upload = dict(newest[: self._max_entries])
