"""
In-process pub/sub backing the SSE stream.

Each subscriber gets a bounded queue. Publishing never awaits and never raises:
a projector that has stopped reading loses updates rather than stalling the
tablet that is uploading.
"""

import asyncio
import contextlib
from collections.abc import AsyncIterator

from app.ports import EventPublisher

DEFAULT_QUEUE_SIZE = 8


class InMemoryEventPublisher(EventPublisher):
    def __init__(self, queue_size: int = DEFAULT_QUEUE_SIZE):
        self._queue_size = queue_size
        self._subscribers: set[asyncio.Queue] = set()

    @property
    def subscriber_count(self) -> int:
        return len(self._subscribers)

    def publish(self, payload: dict) -> None:
        for queue in list(self._subscribers):
            # Drop rather than block - a slow consumer must not affect the upload.
            with contextlib.suppress(asyncio.QueueFull):
                queue.put_nowait(payload)

    @contextlib.asynccontextmanager
    async def subscribe(self) -> AsyncIterator[asyncio.Queue]:
        """
        Register a subscriber for the duration of the block.

        The queue is always removed on exit - including on exception - so a
        disconnected projector cannot leak.
        """
        queue: asyncio.Queue = asyncio.Queue(maxsize=self._queue_size)
        self._subscribers.add(queue)
        try:
            yield queue
        finally:
            self._subscribers.discard(queue)
