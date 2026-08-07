"""
Server-Sent Events transport for planet updates.

Kept separate from the router so it can be exercised directly in tests: the
stream is infinite, which deadlocks a blocking test client, and reaching into
`app.routes` to find the endpoint proved brittle across Starlette versions.
"""

import asyncio
import json

from fastapi import Request
from fastapi.responses import StreamingResponse

from app.application.use_cases import GetCurrentPlanetUseCase
from app.ports import EventPublisher

SSE_KEEPALIVE_SECONDS = 15.0

SSE_HEADERS = {
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    # Disables proxy buffering, which would otherwise delay every event.
    "X-Accel-Buffering": "no",
}


def sse_frame(event: str, payload: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(payload)}\n\n"


def build_planet_event_response(
    request: Request,
    publisher: EventPublisher,
    get_current_planet: GetCurrentPlanetUseCase,
) -> StreamingResponse:
    """
    Stream planet updates to a connected projector.

    Each new subscriber is primed with whatever should be on screen right now,
    then receives every subsequent planet the instant it is stored.
    """

    async def event_stream():
        async with publisher.subscribe() as queue:
            yield sse_frame("planet", get_current_planet.execute())
            while True:
                if await request.is_disconnected():
                    break
                try:
                    payload = await asyncio.wait_for(
                        queue.get(), timeout=SSE_KEEPALIVE_SECONDS
                    )
                except TimeoutError:
                    # Comment frame keeps proxies and Chromium from closing.
                    yield ": keep-alive\n\n"
                    continue
                yield sse_frame("planet", payload)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers=SSE_HEADERS,
    )
