"""Server-Sent Events transport for galaxy updates."""

import asyncio
import contextlib
import json
import signal
import sys
from collections.abc import Callable
from types import FrameType

from fastapi import Request
from fastapi.responses import StreamingResponse

from app.api.event_serializer import serialize_application_event
from app.application.event_types import ApplicationEvent
from app.application.use_cases import GetCurrentPlanetUseCase
from app.ports import EventPublisher

# Short enough that a silent socket is noticed within a few seconds, long
# enough that one late frame is not treated as a dead server. The wall's
# heartbeat budget in LiveUpdates.js must stay above this interval.
SSE_HEARTBEAT_SECONDS = 2.0
# Browser EventSource waits this long before reconnecting after a clean end.
SSE_RETRY_MS = 1000

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
            # Ask the browser to reconnect quickly if this response ends.
            # A clean end is how a graceful stop tells the wall to come back.
            yield f"retry: {SSE_RETRY_MS}\n\n"
            # Compatibility prime: existing projectors expect the current
            # planet payload immediately when the stream opens.
            yield sse_frame("planet", get_current_planet.execute())
            while True:
                if await request.is_disconnected():
                    break
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=SSE_HEARTBEAT_SECONDS)
                except TimeoutError:
                    # Named event, not an SSE comment: the browser exposes
                    # comments to the connection but not to the page, so the
                    # wall cannot time out a silent socket on comments alone.
                    yield sse_frame("heartbeat", {"ok": True})
                    continue
                if event is None:
                    break
                event_name, payload = serialize_application_event(event)
                yield sse_frame(event_name, payload)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers=SSE_HEADERS,
    )


def install_graceful_stream_shutdown(publisher: EventPublisher) -> Callable[[], None]:
    """End projector streams when this process is asked to stop.

    Uvicorn's graceful shutdown does not close an in-flight streaming
    response. It only turns off HTTP keep-alive, then waits until the
    response finishes. This stream never finishes, so a normal stop holds
    the wall's socket until the process is killed. Docker's stop timeout is
    10 seconds; after that the socket can stay half-open and the wall stops
    issuing requests. Waking the stream lets the response end, the process
    exit, and the browser reconnect.

    Installed only in a real uvicorn process. The test suite shares this
    interpreter and must keep the runner's signal handlers.
    """
    if not _launched_by_uvicorn():
        return lambda: None

    loop = asyncio.get_running_loop()
    restored: list[tuple[int, signal.Handlers | Callable[..., object] | None]] = []

    def chain(
        previous: signal.Handlers | Callable[..., object] | None,
    ) -> Callable[[int, FrameType | None], None]:
        def handler(signum: int, frame: FrameType | None) -> None:
            with contextlib.suppress(RuntimeError):
                loop.call_soon_threadsafe(publisher.request_disconnect)
            if callable(previous):
                previous(signum, frame)

        return handler

    for sig in (signal.SIGTERM, signal.SIGINT):
        try:
            previous = signal.getsignal(sig)
            signal.signal(sig, chain(previous))
        except ValueError:
            continue
        restored.append((sig, previous))

    def restore() -> None:
        for sig, previous in restored:
            with contextlib.suppress(ValueError):
                signal.signal(sig, previous)

    return restore


def _launched_by_uvicorn() -> bool:
    return "uvicorn" in " ".join(sys.argv[:3])
