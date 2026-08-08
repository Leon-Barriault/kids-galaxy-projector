"""Server-Sent Events transport for galaxy updates."""

import asyncio
import json

from fastapi import Request
from fastapi.responses import StreamingResponse

from app.api.event_serializer import serialize_application_event
from app.application.event_types import ApplicationEvent
from app.application.use_cases import GetCurrentPlanetUseCase
from app.ports import EventPublisher

SSE_KEEPALIVE_SECONDS = 15.0

SSE_HEADERS = {
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
}


def sse_frame(event: str, payload: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(payload)}\n\n"


def serialize_event(event: ApplicationEvent) -> tuple[str, dict]:
    """Public transport helper kept here for focused SSE tests."""
    return serialize_application_event(event)


def build_planet_event_response(
    request: Request,
    publisher: EventPublisher,
    get_current_planet: GetCurrentPlanetUseCase,
) -> StreamingResponse:
    """Stream the current state followed by typed application events."""

    async def event_stream():
        async with publisher.subscribe() as queue:
            # Compatibility prime: existing projectors expect the current
            # planet payload immediately when the stream opens.
            yield sse_frame("planet", get_current_planet.execute())
            while True:
                if await request.is_disconnected():
                    break
                try:
                    event = await asyncio.wait_for(
                        queue.get(), timeout=SSE_KEEPALIVE_SECONDS
                    )
                except TimeoutError:
                    yield ": keep-alive\n\n"
                    continue
                event_name, payload = serialize_application_event(event)
                yield sse_frame(event_name, payload)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers=SSE_HEADERS,
    )
