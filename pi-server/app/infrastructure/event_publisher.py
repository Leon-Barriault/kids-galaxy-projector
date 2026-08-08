"""In-process pub/sub backing the SSE stream."""

import asyncio
import contextlib
from collections.abc import AsyncIterator

from app.application.event_types import ApplicationEvent
from app.ports import EventPublisher

DEFAULT_QUEUE_SIZE = 8


class InMemoryEventPublisher(EventPublisher):
    def __init__(self, queue_size: int = DEFAULT_QUEUE_SIZE):
        self._queue_size = queue_size
        self._subscribers: set[asyncio.Queue[ApplicationEvent]] = set()

    @property
    def subscriber_count(self) -> int:
        return len(self._subscribers)

    def publish(self, event: ApplicationEvent) -> None:
        for queue in list(self._subscribers):
            with contextlib.suppress(asyncio.QueueFull):
                queue.put_nowait(event)

    @contextlib.asynccontextmanager
    async def subscribe(self) -> AsyncIterator[asyncio.Queue[ApplicationEvent]]:
        queue: asyncio.Queue[ApplicationEvent] = asyncio.Queue(
            maxsize=self._queue_size
        )
        self._subscribers.add(queue)
        try:
            yield queue
        finally:
            self._subscribers.discard(queue)
