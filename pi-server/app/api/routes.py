"""HTTP layer: translate requests into application use cases.

This module is deliberately thin. It:

- Performs the absolute minimum of transport concerns (reading the body,
  applying size guards, choosing status codes).
- Delegates every business decision to a use case.
- Maps DomainError subclasses onto HTTP status codes via ``_status_for``.
- Applies role-based access control through the AuthorizationPolicy.

No domain rules live here. If a new validation is needed, it belongs in the
domain or a use case, not in a route handler.
"""

import logging

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    Request,
    UploadFile,
)
from fastapi.responses import FileResponse, HTMLResponse

from app.api.auth import AuthorizationPolicy, ClientRole
from app.api.behavior_mapper import behavior_settings_to_payload, behavior_to_payload
from app.api.behavior_models import BehaviorUpdateRequest
from app.api.sse import build_planet_event_response
from app.application.behavior_use_cases import (
    GetGalaxyBehaviorUseCase,
    UpdateGalaxyBehaviorUseCase,
)
from app.application.use_cases import (
    ClearPlanetsUseCase,
    DeletePlanetUseCase,
    GetCurrentPlanetUseCase,
    GetCurrentSceneUseCase,
    ListRecentPlanetsUseCase,
    SubmitPlanetUseCase,
)
from app.domain.errors import DomainError, NotFoundError, RateLimitedError, ValidationError
from app.domain.galaxy import Galaxy
from app.domain.image_rules import ensure_size_within
from app.domain.planet_customization import DEFAULT_RING_COLOR
from app.ports import EventPublisher, PlanetRepository

logger = logging.getLogger(__name__)


def _status_for(error: DomainError) -> int:
    """Map a domain error onto the appropriate HTTP status code."""
    if isinstance(error, RateLimitedError):
        return 429
    if isinstance(error, ValidationError):
        return 400
    if isinstance(error, NotFoundError):
        return 404
    return 500


def client_key(request: Request) -> str:
    """Stable identifier used by the rate limiter (client IP, or "unknown")."""
    return request.client.host if request.client else "unknown"


def _behavior_state_payload(state) -> dict:
    """Serialize a GalaxyBehaviorState for the REST API."""
    return {
        "effective": behavior_to_payload(state.effective),
        "settings": behavior_settings_to_payload(state.settings),
    }


def build_router(
    *,
    submit_planet: SubmitPlanetUseCase,
    get_current_planet: GetCurrentPlanetUseCase,
    get_current_scene: GetCurrentSceneUseCase,
    list_recent_planets: ListRecentPlanetsUseCase,
    delete_planet: DeletePlanetUseCase,
    clear_planets: ClearPlanetsUseCase,
    get_behavior: GetGalaxyBehaviorUseCase,
    update_behavior: UpdateGalaxyBehaviorUseCase,
    repository: PlanetRepository,
    publisher: EventPublisher,
    settings_galaxy: Galaxy,
    authorizer: AuthorizationPolicy,
    settings,
) -> APIRouter:
    """Compose the FastAPI router with all use cases and auth dependencies wired in.

    This is the composition point for the HTTP surface. The factory calls it
    once at startup after the concrete adapters have been constructed.
    """
    router = APIRouter()

    projector_only = authorizer.dependency(ClientRole.PROJECTOR)
    projector_or_manager = authorizer.dependency(
        ClientRole.PROJECTOR,
        ClientRole.MANAGER,
    )
    kid_only = authorizer.dependency(ClientRole.KID)
    manager_only = authorizer.dependency(ClientRole.MANAGER)

    @router.get(
        "/",
        response_class=HTMLResponse,
        dependencies=[Depends(projector_only)],
    )
    async def galaxy_page():
        """Serve the projector HTML page (Three.js galaxy visualisation)."""
        index_path = settings.static_dir / "index.html"
        if not index_path.exists():
            return HTMLResponse(
                "<h1>Galaxy visualization not found</h1>", status_code=404
            )
        return FileResponse(index_path)

    @router.get("/health")
    async def health():
        """Liveness probe used by Docker and monitoring."""
        return {"status": "ok", "service": "kids-galaxy-projector"}

    @router.get("/api/galaxy")
    async def galaxy_identity():
        """Return the galaxy name and service marker (used by tablet discovery)."""
        return settings_galaxy.to_payload()

    @router.get(
        "/api/current-planet",
        dependencies=[Depends(projector_or_manager)],
    )
    async def current_planet():
        """Return the single most-recent planet (or the empty payload)."""
        return get_current_planet.execute()

    @router.get(
        "/api/scene",
        dependencies=[Depends(projector_or_manager)],
    )
    async def current_scene():
        """Return the planets currently visible in the sky (gallery size)."""
        scene = get_current_scene.execute()
        return {"planets": [planet.to_payload() for planet in scene.planets]}

    @router.get(
        "/api/behavior",
        dependencies=[Depends(projector_or_manager)],
    )
    async def galaxy_behavior():
        """Return both the stored settings and the currently effective behaviour."""
        return _behavior_state_payload(get_behavior.execute())

    @router.put(
        "/api/behavior",
        dependencies=[Depends(manager_only)],
    )
    async def update_galaxy_behavior(request: BehaviorUpdateRequest):
        """Update operator behaviour settings (manager only)."""
        return _behavior_state_payload(update_behavior.execute(request.to_domain()))

    @router.get(
        "/api/planets",
        dependencies=[Depends(projector_or_manager)],
    )
    async def planet_gallery(
        limit: int | None = Query(default=None, ge=1),
    ):
        """Return recent planets for the manager gallery or projector reconciliation."""
        return list_recent_planets.execute(limit=limit)

    @router.post(
        "/api/upload",
        dependencies=[Depends(kid_only)],
    )
    async def upload_planet(
        request: Request,
        file: UploadFile = File(...),
        name: str = Form("My Planet"),
        style: str = Form("classic"),
        companions: str = Form(""),
        ring_color: str = Form(DEFAULT_RING_COLOR),
    ):
        """Accept a child's drawing and launch it into the galaxy.

        Size is guarded both via Content-Length (when present) and by reading
        at most max_file_size + 1 bytes so a malicious client cannot force the
        server to buffer an unbounded body.
        """
        if file.size is not None:
            _guard(lambda: ensure_size_within(file.size, settings.max_file_size))
        content = await file.read(settings.max_file_size + 1)
        try:
            planet = submit_planet.execute(
                image_bytes=content,
                content_type=file.content_type,
                raw_name=name,
                raw_style=style,
                raw_companions=companions,
                raw_ring_color=ring_color,
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
            "Planet received from %s: %s (%s, %s)",
            client_key(request),
            planet.filename,
            planet.display_name,
            planet.style,
        )
        return {
            "status": "success",
            "message": "Your planet is flying to the galaxy!",
            "planet_id": planet.id,
            "name": planet.display_name,
            "url": planet.url,
            "style": planet.style,
            "companions": list(planet.companions),
            "ring_color": planet.ring_color,
        }

    @router.delete(
        "/api/planets",
        dependencies=[Depends(manager_only)],
    )
    async def clear_planets_route():
        """Remove every planet from the galaxy (manager only)."""
        removed = clear_planets.execute()
        return {"status": "cleared", "removed": removed}

    @router.delete(
        "/api/planets/{planet_id}",
        dependencies=[Depends(manager_only)],
    )
    async def delete_planet_route(planet_id: str):
        """Remove a single planet by id (manager only)."""
        try:
            planet = delete_planet.execute(planet_id)
        except DomainError as e:
            raise HTTPException(
                status_code=_status_for(e), detail=e.user_message
            ) from e
        return {
            "status": "deleted",
            "planet_id": planet.id,
            "name": planet.display_name,
        }

    @router.get("/uploads/{filename}")
    async def serve_upload(filename: str):
        """Serve a planet texture PNG. Path traversal is rejected by the repository."""
        path = repository.resolve_image(filename)
        if path is None:
            raise HTTPException(status_code=404, detail="Planet not found")
        return FileResponse(path)

    @router.get(
        "/api/events",
        dependencies=[Depends(projector_only)],
    )
    async def planet_events(request: Request):
        """Server-Sent Events stream of planet arrivals, removals and clears."""
        return build_planet_event_response(request, publisher, get_current_planet)

    return router


def _guard(action) -> None:
    """Run a domain guard and translate any DomainError into an HTTPException."""
    try:
        action()
    except DomainError as e:
        raise HTTPException(status_code=_status_for(e), detail=e.user_message) from e
