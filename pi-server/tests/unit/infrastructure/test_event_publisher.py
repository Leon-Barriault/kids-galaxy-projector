"""
Infrastructure: in-process pub/sub behind the SSE endpoint.

Verifies fan-out, subscriber cleanup, and that one stalled projector cannot
block an uploading tablet.
"""

import asyncio

import pytest

from app.infrastructure.event_publisher import InMemoryEventPublisher

PAYLOAD = {"has_planet": True, "name": "Pushed", "url": "/uploads/x.png"}


class TestInMemoryEventPublisher:
    async def test_subscriber_receives_published_payload(self):
        publisher = InMemoryEventPublisher()
        async with publisher.subscribe() as stream:
            publisher.publish(PAYLOAD)
            received = await asyncio.wait_for(stream.get(), timeout=1)
        assert received == PAYLOAD

    async def test_fans_out_to_every_subscriber(self):
        publisher = InMemoryEventPublisher()
        async with publisher.subscribe() as a, publisher.subscribe() as b:
            publisher.publish(PAYLOAD)
            assert await asyncio.wait_for(a.get(), timeout=1) == PAYLOAD
            assert await asyncio.wait_for(b.get(), timeout=1) == PAYLOAD

    async def test_subscriber_is_released_on_exit(self):
        publisher = InMemoryEventPublisher()
        assert publisher.subscriber_count == 0
        async with publisher.subscribe():
            assert publisher.subscriber_count == 1
        assert publisher.subscriber_count == 0

    async def test_subscriber_released_even_if_body_raises(self):
        publisher = InMemoryEventPublisher()
        with pytest.raises(RuntimeError):
            async with publisher.subscribe():
                raise RuntimeError("projector crashed")
        assert publisher.subscriber_count == 0

    async def test_slow_subscriber_does_not_block_publishing(self):
        """A full queue drops updates rather than stalling the upload request."""
        publisher = InMemoryEventPublisher(queue_size=2)
        async with publisher.subscribe() as stream:
            for i in range(10):
                publisher.publish({"n": i})  # must not raise or hang
            assert stream.qsize() <= 2

    async def test_publish_with_no_subscribers_is_safe(self):
        InMemoryEventPublisher().publish(PAYLOAD)  # must not raise
