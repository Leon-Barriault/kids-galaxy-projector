"""HTTP layer: translate requests into application use cases.

This module is deliberately thin. It:

- Performs the absolute minimum of transport concerns (reading the body,
  applying size guards, choosing status codes).
- Delegates every business decision to a use case.
- Maps DomainError subclasses onto HTTP status codes via ``_status_for``.
- Applies role-based access control through the AuthorizationPolicy.
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
    Response,
    UploadFile,
)
from fastapi.responses import FileResponse, HTMLResponse
from starlette.concurrency import run_in_threadpool

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
    GetPlanetByIdUseCase,
    ListRecentPlanetsUseCase,
    SubmitPlanetUseCase,
)
from app.domain.errors import DomainError, NotFoundError, RateLimitedError, ValidationError
from app.domain.galaxy import Galaxy
from app.domain.image_rules import ensure_size_within
from app.domain.planet_customization import (
    DEFAULT_CRATER_COLOR,
    DEFAULT_MOUNTAIN_COLOR,
    DEFAULT_RING_COLOR,
)
from app.ports import EventPublisher, PlanetExportRenderer, PlanetRepository

logger = logging.getLogger(__name__)


def _status_for(error: DomainError) -> int:
    if isinstance(error, RateLimitedError):
        return 429
    if isinstance(error, ValidationError):
        return 400
    if isinstance(error, NotFoundError):
        return 404
    return 500


def client_key(request: Request, authorizer: AuthorizationPolicy | None = None) -> str:
    """
    The identity the upload cooldown is keyed on.

    Behind the mTLS gateway every tablet connects from the proxy's loopback
    address, so keying on the peer address alone collapses the whole classroom
    into one bucket: the first kid to send a planet locks out everyone else for
    the cooldown, and it reads as a mysterious intermittent failure rather than
    as rate limiting. When the gateway forwards a client certificate serial we
    key on that instead.

    The forwarded value is only believed when the request genuinely came from a
    trusted proxy host carrying the gateway marker, so a client cannot mint its
    own key to escape its cooldown. With no authorizer - or no gateway - this is
    the original peer-address behaviour.
    """
    peer = request.client.host if request.client else "unknown"
    if authorizer is not None:
        identity = authorizer.client_identity(request)
        if identity:
            return f"cert:{identity}"
    return peer


def _behavior_state_payload(state) -> dict:
    return {
        "effective": behavior_to_payload(state.effective),
        "settings": behavior_settings_to_payload(state.settings),
    }


def build_router(
    *,
    submit_planet: SubmitPlanetUseCase,
    get_current_planet: GetCurrentPlanetUseCase,
    get_current_scene: GetCurrentSceneUseCase,
    get_planet: GetPlanetByIdUseCase,
    list_recent_planets: ListRecentPlanetsUseCase,
    delete_planet: DeletePlanetUseCase,
    clear_planets: ClearPlanetsUseCase,
    get_behavior: GetGalaxyBehaviorUseCase,
    update_behavior: UpdateGalaxyBehaviorUseCase,
    repository: PlanetRepository,
    export_renderer: PlanetExportRenderer,
    publisher: EventPublisher,
    settings_galaxy: Galaxy,
    authorizer: AuthorizationPolicy,
    settings,
) -> APIRouter:
    router = APIRouter()

    projector_only = authorizer.dependency(ClientRole.PROJECTOR)
    projector_or_manager = authorizer.dependency(ClientRole.PROJECTOR, ClientRole.MANAGER)
    kid_only = authorizer.dependency(ClientRole.KID)
    manager_only = authorizer.dependency(ClientRole.MANAGER)

    def export_target(planet_id: str):
        try:
            planet = get_planet.execute(planet_id)
        except DomainError as e:
            raise HTTPException(status_code=_status_for(e), detail=e.user_message) from e
        image_path = repository.resolve_image(planet.filename)
        if image_path is None:
            raise HTTPException(status_code=404, detail="Planet drawing not found")
        return planet, image_path

    def require_projector_snapshot(planet) -> None:
        if export_renderer.has_projector_snapshot(planet):
            return
        raise HTTPException(
            status_code=409,
            detail="Projector WebGL render is not ready yet",
        )

    @router.get("/", response_class=HTMLResponse, dependencies=[Depends(projector_only)])
    async def galaxy_page():
        index_path = settings.static_dir / "index.html"
        if not index_path.exists():
            return HTMLResponse("<h1>Galaxy visualization not found</h1>", status_code=404)
        return FileResponse(index_path)

    @router.get("/health")
    async def health():
        return {"status": "ok", "service": "kids-galaxy-projector"}

    @router.get("/api/galaxy")
    async def galaxy_identity():
        return settings_galaxy.to_payload()

    @router.get("/api/current-planet", dependencies=[Depends(projector_or_manager)])
    async def current_planet():
        return get_current_planet.execute()

    @router.get("/api/scene", dependencies=[Depends(projector_or_manager)])
    async def current_scene():
        scene = get_current_scene.execute()
        return {"planets": [planet.to_payload() for planet in scene.planets]}

    @router.get("/api/behavior", dependencies=[Depends(projector_or_manager)])
    async def galaxy_behavior():
        return _behavior_state_payload(get_behavior.execute())

    @router.put("/api/behavior", dependencies=[Depends(manager_only)])
    async def update_galaxy_behavior(request: BehaviorUpdateRequest):
        return _behavior_state_payload(update_behavior.execute(request.to_domain()))

    @router.get("/api/planets", dependencies=[Depends(projector_or_manager)])
    async def planet_gallery(limit: int | None = Query(default=None, ge=1)):
        return list_recent_planets.execute(limit=limit)

    # The Pi is authoritative for all visual exports. The projector browser
    # publishes the exact finalized Three.js hero image; manager clients only
    # consume the resulting server-side preview/print/PDF resources.
    @router.put(
        "/api/admin/planets/{planet_id}/rendered-preview.png",
        dependencies=[Depends(projector_only)],
    )
    async def store_projector_preview(planet_id: str, request: Request):
        planet, _image_path = export_target(planet_id)
        content = await request.body()
        if len(content) > settings.max_file_size:
            raise HTTPException(status_code=413, detail="Projector snapshot is too large")
        try:
            export_renderer.store_projector_snapshot(planet, content)
        except (ValueError, OSError) as error:
            raise HTTPException(status_code=400, detail=str(error)) from error
        return {"status": "stored", "planet_id": planet.id, "source": "projector-webgl"}

    # Every export below is manager-only. They are "/api/admin/..." resources
    # that hand back a child's artwork rendered for print, so an unauthenticated
    # caller who guesses or scrapes a planet id must not be able to pull them.
    # The rendering itself is 100-800 ms of Pillow/NumPy work, so it runs in a
    # worker thread; called inline it stalls the SSE loop for every projector.
    @router.get(
        "/api/admin/planets/{planet_id}/preview.png",
        dependencies=[Depends(manager_only)],
    )
    async def preview_planet(planet_id: str):
        planet, image_path = export_target(planet_id)
        source = "webgl" if export_renderer.has_projector_snapshot(planet) else "fallback"
        content = await run_in_threadpool(
            export_renderer.render_preview, planet, image_path
        )
        return Response(
            content=content,
            media_type="image/png",
            headers={
                "Cache-Control": "no-store",
                "X-Kids-Galaxy-Render-Source": source,
            },
        )

    @router.get(
        "/api/admin/planets/{planet_id}/print.png",
        dependencies=[Depends(manager_only)],
    )
    async def print_planet_png(planet_id: str):
        planet, image_path = export_target(planet_id)
        require_projector_snapshot(planet)
        content = await run_in_threadpool(
            export_renderer.render_print_sheet, planet, image_path
        )
        return Response(
            content=content,
            media_type="image/png",
            headers={
                "Content-Disposition": f'inline; filename="{planet.id}_planet_print.png"',
                "X-Kids-Galaxy-Render-Source": "webgl",
            },
        )

    @router.get(
        "/api/admin/planets/{planet_id}/print.pdf",
        dependencies=[Depends(manager_only)],
    )
    async def print_planet_pdf(planet_id: str):
        planet, image_path = export_target(planet_id)
        require_projector_snapshot(planet)
        content = await run_in_threadpool(
            export_renderer.render_print_pdf, planet, image_path
        )
        return Response(
            content=content,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f'inline; filename="{planet.id}_planet_print.pdf"',
                "X-Kids-Galaxy-Render-Source": "webgl",
            },
        )

    @router.get(
        "/api/admin/planets/{planet_id}/model.stl",
        dependencies=[Depends(manager_only)],
    )
    async def export_planet_stl(
        planet_id: str,
        diameter_mm: float = Query(default=80.0, ge=40.0, le=200.0),
    ):
        planet, image_path = export_target(planet_id)
        content = await run_in_threadpool(
            export_renderer.export_stl, planet, image_path, diameter_mm
        )
        return Response(
            content=content,
            media_type="application/sla",
            headers={
                "Content-Disposition": f'attachment; filename="{planet.id}_planet.stl"'
            },
        )

    @router.post("/api/upload", dependencies=[Depends(kid_only)])
    async def upload_planet(
        request: Request,
        file: UploadFile = File(...),
        name: str = Form("My Planet"),
        style: str = Form("classic"),
        companions: str = Form(""),
        body_color: str | None = Form(None),
        ring_color: str = Form(DEFAULT_RING_COLOR),
        crater_color: str = Form(DEFAULT_CRATER_COLOR),
        mountain_color: str = Form(DEFAULT_MOUNTAIN_COLOR),
    ):
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
                raw_body_color=body_color,
                raw_ring_color=ring_color,
                raw_crater_color=crater_color,
                raw_mountain_color=mountain_color,
                client_key=client_key(request, authorizer),
                max_size=settings.max_file_size,
                max_dimension=settings.max_dimension,
                target_size=settings.texture_size,
            )
        except DomainError as e:
            raise HTTPException(status_code=_status_for(e), detail=e.user_message) from e

        logger.info(
            "Planet received from %s: %s (%s, %s)",
            client_key(request, authorizer),
            planet.filename,
            planet.display_name,
            planet.style,
        )
        response = {
            "status": "success",
            "message": "Your planet is flying to the galaxy!",
            "planet_id": planet.id,
            "name": planet.display_name,
            "url": planet.url,
            "style": planet.style,
            "companions": list(planet.companions),
            "ring_color": planet.ring_color,
            "crater_color": planet.crater_color,
            "mountain_color": planet.mountain_color,
        }
        if planet.body_color is not None:
            response["body_color"] = planet.body_color
        return response

    @router.delete("/api/planets", dependencies=[Depends(manager_only)])
    async def clear_planets_route():
        removed = clear_planets.execute()
        return {"status": "cleared", "removed": removed}

    @router.delete("/api/planets/{planet_id}", dependencies=[Depends(manager_only)])
    async def delete_planet_route(planet_id: str):
        try:
            planet = delete_planet.execute(planet_id)
        except DomainError as e:
            raise HTTPException(status_code=_status_for(e), detail=e.user_message) from e
        return {"status": "deleted", "planet_id": planet.id, "name": planet.display_name}

    @router.get("/uploads/{filename}")
    async def serve_upload(filename: str):
        path = repository.resolve_image(filename)
        if path is None:
            raise HTTPException(status_code=404, detail="Planet not found")
        return FileResponse(path)

    @router.get("/api/events", dependencies=[Depends(projector_only)])
    async def planet_events(request: Request):
        return build_planet_event_response(request, publisher, get_current_planet)

    return router


def _guard(action) -> None:
    try:
        action()
    except DomainError as e:
        raise HTTPException(status_code=_status_for(e), detail=e.user_message) from e
