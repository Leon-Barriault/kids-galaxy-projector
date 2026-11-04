"""In-process pub/sub backing the SSE stream.

A lightweight, single-process fan-out suitable for one server process and a
handful of concurrent projector browsers and manager tablets.

Design notes:
- publish() is non-blocking; a full subscriber queue simply drops the event
  for that subscriber rather than stalling the upload path.
- subscribe() is an async context manager that automatically cleans up when
  the SSE connection closes.
- request_disconnect() wakes every subscriber with None so a graceful stop
  can finish the stream instead of waiting on it forever.
"""

import asyncio
import contextlib
from collections.abc import AsyncIterator

from app.application.event_types import ApplicationEvent
from app.ports import EventPublisher

DEFAULT_QUEUE_SIZE = 8


class InMemoryEventPublisher(EventPublisher):
    """Simple in-memory implementation of the EventPublisher port."""

    def __init__(self, queue_size: int = DEFAULT_QUEUE_SIZE):
        """
        Args:
            queue_size: Maximum number of pending events per subscriber.
                Small on purpose - a projector that falls behind should not
                accumulate an unbounded backlog.
        """
        self._queue_size = queue_size
        self._subscribers: set[asyncio.Queue[ApplicationEvent | None]] = set()
        self._closing = False

    @property
    def subscriber_count(self) -> int:
        """Number of currently connected subscribers (for diagnostics)."""
        return len(self._subscribers)

    def publish(self, event: ApplicationEvent) -> None:
        """Deliver an event to all current subscribers without blocking."""
        for queue in list(self._subscribers):
            with contextlib.suppress(asyncio.QueueFull):
                queue.put_nowait(event)

    def request_disconnect(self) -> None:
        """Unblock subscribers so their streams can end during shutdown."""
        self._closing = True
        for queue in list(self._subscribers):
            self._offer_stop(queue)

    def _offer_stop(self, queue: asyncio.Queue[ApplicationEvent | None]) -> None:
        """Queue the stop signal, dropping one pending event if the queue is full."""
        while True:
            try:
                queue.put_nowait(None)
                return
            except asyncio.QueueFull:
                try:
                    queue.get_nowait()
                except asyncio.QueueEmpty:
                    return

    @contextlib.asynccontextmanager
    async def subscribe(
        self,
    ) -> AsyncIterator[asyncio.Queue[ApplicationEvent | None]]:
        """Async context manager that yields a private event queue.

        The queue is automatically removed from the subscriber set when the
        surrounding async-with block exits (i.e. when the SSE client
        disconnects). A queued None means the process is shutting down.
        """
        queue: asyncio.Queue[ApplicationEvent | None] = asyncio.Queue(maxsize=self._queue_size)
        self._subscribers.add(queue)
        if self._closing:
            self._offer_stop(queue)
        try:
            yield queue
        finally:
            self._subscribers.discard(queue)
