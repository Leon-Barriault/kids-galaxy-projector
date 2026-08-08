"""HTTP layer: translate requests into application use cases."""

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
from app.api.sse import build_planet_event_response
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
from app.ports import EventPublisher, PlanetRepository

logger = logging.getLogger(__name__)


def _status_for(error: DomainError) -> int:
    if isinstance(error, RateLimitedError):
        return 429
    if isinstance(error, ValidationError):
        return 400
    if isinstance(error, NotFoundError):
        return 404
    return 500


def client_key(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def build_router(
    *,
    submit_planet: SubmitPlanetUseCase,
    get_current_planet: GetCurrentPlanetUseCase,
    get_current_scene: GetCurrentSceneUseCase,
    list_recent_planets: ListRecentPlanetsUseCase,
    delete_planet: DeletePlanetUseCase,
    clear_planets: ClearPlanetsUseCase,
    repository: PlanetRepository,
    publisher: EventPublisher,
    settings_galaxy: Galaxy,
    authorizer: AuthorizationPolicy,
    settings,
) -> APIRouter:
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
        index_path = settings.static_dir / "index.html"
        if not index_path.exists():
            return HTMLResponse(
                "<h1>Galaxy visualization not found</h1>", status_code=404
            )
        return FileResponse(index_path)

    @router.get("/health")
    async def health():
        return {"status": "ok", "service": "kids-galaxy-projector"}

    @router.get("/api/galaxy")
    async def galaxy_identity():
        return settings_galaxy.to_payload()

    @router.get(
        "/api/current-planet",
        dependencies=[Depends(projector_or_manager)],
    )
    async def current_planet():
        return get_current_planet.execute()

    @router.get(
        "/api/scene",
        dependencies=[Depends(projector_or_manager)],
    )
    async def current_scene():
        scene = get_current_scene.execute()
        return {"planets": [planet.to_payload() for planet in scene.planets]}

    @router.get(
        "/api/planets",
        dependencies=[Depends(projector_or_manager)],
    )
    async def planet_gallery(
        limit: int | None = Query(default=None, ge=1),
    ):
        return list_recent_planets.execute(limit=limit)

    @router.post(
        "/api/upload",
        dependencies=[Depends(kid_only)],
    )
    async def upload_planet(
        request: Request,
        file: UploadFile = File(...),
        name: str = Form("My Planet"),
    ):
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

    @router.delete(
        "/api/planets",
        dependencies=[Depends(manager_only)],
    )
    async def clear_planets_route():
        removed = clear_planets.execute()
        return {"status": "cleared", "removed": removed}

    @router.delete(
        "/api/planets/{planet_id}",
        dependencies=[Depends(manager_only)],
    )
    async def delete_planet_route(planet_id: str):
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

    # Texture bytes are a presentation asset, not a management capability.
    # Keeping them readable allows the projector and Coil thumbnails to fetch
    # images without carrying a second authenticated API session. Listing,
    # deleting, clearing, and uploading remain role-protected.
    @router.get("/uploads/{filename}")
    async def serve_upload(filename: str):
        path = repository.resolve_image(filename)
        if path is None:
            raise HTTPException(status_code=404, detail="Planet not found")
        return FileResponse(path)

    @router.get(
        "/api/events",
        dependencies=[Depends(projector_only)],
    )
    async def planet_events(request: Request):
        return build_planet_event_response(request, publisher, get_current_planet)

    return router


def _guard(action) -> None:
    try:
        action()
    except DomainError as e:
        raise HTTPException(status_code=_status_for(e), detail=e.user_message) from e
