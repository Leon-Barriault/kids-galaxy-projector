"""
HTTP layer.

Thin by design: read the request, call a use case, translate domain errors into
status codes. No business rules live here.
"""

import asyncio
import json
import logging

from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, HTMLResponse, StreamingResponse

from app.application.use_cases import GetCurrentPlanetUseCase, SubmitPlanetUseCase
from app.domain.errors import DomainError, RateLimitedError, ValidationError
from app.domain.image_rules import ensure_size_within
from app.ports import EventPublisher, PlanetRepository

logger = logging.getLogger(__name__)

SSE_KEEPALIVE_SECONDS = 15.0


def _status_for(error: DomainError) -> int:
    if isinstance(error, RateLimitedError):
        return 429
    if isinstance(error, ValidationError):
        return 400
    return 500


def _sse_frame(event: str, payload: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(payload)}\n\n"


def client_key(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def build_router(
    *,
    submit_planet: SubmitPlanetUseCase,
    get_current_planet: GetCurrentPlanetUseCase,
    repository: PlanetRepository,
    publisher: EventPublisher,
    settings,
) -> APIRouter:
    router = APIRouter()

    @router.get("/", response_class=HTMLResponse)
    async def galaxy_page():
        """Serve the Three.js galaxy visualization."""
        index_path = settings.static_dir / "index.html"
        if not index_path.exists():
            return HTMLResponse(
                "<h1>Galaxy visualization not found</h1>", status_code=404
            )
        return FileResponse(index_path)

    @router.get("/health")
    async def health():
        return {"status": "ok", "service": "kids-galaxy-projector"}

    @router.get("/api/current-planet")
    async def current_planet():
        return get_current_planet.execute()

    @router.post("/api/upload")
    async def upload_planet(
        request: Request,
        file: UploadFile = File(...),
        name: str = Form("My Planet"),
    ):
        """Receive a planet drawing from the Android app."""
        # Reject oversized uploads before buffering the body. Starlette fills in
        # UploadFile.size from the multipart part length; the bounded read below
        # covers a missing or dishonest length.
        if file.size is not None:
            _guard(lambda: ensure_size_within(file.size, settings.max_file_size))

        content = await file.read(settings.max_file_size + 1)

        try:
            planet = submit_planet.execute(
                image_bytes=content,
                content_type=file.content_type,
                raw_name=name,
                client_key=client_key(request),
                max_size=settings.max_file_size,
                max_dimension=settings.max_dimension,
                target_size=settings.texture_size,
            )
        except DomainError as e:
            raise HTTPException(
                status_code=_status_for(e), detail=e.user_message
            ) from e

        logger.info(
            "Planet received from %s: %s (%s)",
            client_key(request),
            planet.filename,
            planet.display_name,
        )

        return {
            "status": "success",
            "message": "Your planet is flying to the galaxy!",
            "planet_id": planet.id,
            "name": planet.display_name,
            "url": planet.url,
        }

    @router.get("/uploads/{filename}")
    async def serve_upload(filename: str):
        path = repository.resolve_image(filename)
        if path is None:
            raise HTTPException(status_code=404, detail="Planet not found")
        return FileResponse(path)

    @router.get("/api/events")
    async def planet_events(request: Request):
        """
        Server-Sent Events stream: pushes each new planet immediately, so the
        projector celebrates without waiting for a poll tick. The front-end
        falls back to polling if this stream is unavailable.
        """

        async def event_stream():
            async with publisher.subscribe() as queue:
                # Prime the client with whatever should be on screen right now.
                yield _sse_frame("planet", get_current_planet.execute())
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
                    yield _sse_frame("planet", payload)

        return StreamingResponse(
            event_stream(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )

    return router


def _guard(action) -> None:
    """Run a domain rule, converting its error into an HTTP response."""
    try:
        action()
    except DomainError as e:
        raise HTTPException(status_code=_status_for(e), detail=e.user_message) from e
