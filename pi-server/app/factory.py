"""Composition root for the Kids Galaxy service."""

import contextlib
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.auth import AuthorizationPolicy
from app.api.routes import build_router
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
from app.config import Settings
from app.domain.behavior import SeasonalThemeResolver
from app.domain.galaxy import Galaxy
from app.infrastructure.behavior_repository import JsonBehaviorRepository
from app.infrastructure.clock import SystemClock
from app.infrastructure.event_publisher import InMemoryEventPublisher
from app.infrastructure.filesystem_repository import FileSystemPlanetRepository
from app.infrastructure.image_processor import PillowImageProcessor
from app.infrastructure.planet_export_renderer import PillowPlanetExportRenderer
from app.infrastructure.rate_limiter import InMemoryRateLimiter
from app.infrastructure.service_advertiser import (
    NullServiceAdvertiser,
    ZeroconfServiceAdvertiser,
)
from app.infrastructure.surface_styler import PillowSurfaceStyler

logger = logging.getLogger("kids-galaxy")


def _styler_for(style: str):
    """Return the product-safe passthrough surface styler.

    Planet appearance is now interpreted by the projector from the child's raw
    drawing. The old ``terrain``/``blend`` server styles diffused marker colours
    until untouched paper disappeared, permanently destroying the recognizable
    composition before Three.js could see it. Keep accepting the legacy config
    strings so deployed environment files do not fail to boot, but never bake
    those transformations into newly stored planets.
    """
    if style != "off":
        logger.info(
            "Ignoring legacy SURFACE_STYLE=%s; projector owns planet art direction",
            style,
        )
    return PillowSurfaceStyler(enabled=False)


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings.from_env()
    logging.basicConfig(level=logging.INFO)

    repository = FileSystemPlanetRepository(settings.upload_dir)
    behavior_repository = JsonBehaviorRepository(settings.state_dir)
    publisher = InMemoryEventPublisher()
    rate_limiter = InMemoryRateLimiter(
        cooldown_seconds=settings.rate_limit_seconds
    )
    image_processor = PillowImageProcessor()
    surface_styler = _styler_for(settings.surface_style)
    export_renderer = PillowPlanetExportRenderer()
    authorizer = AuthorizationPolicy(settings)
    clock = SystemClock()
    seasonal_resolver = SeasonalThemeResolver()

    submit_planet = SubmitPlanetUseCase(
        repository=repository,
        publisher=publisher,
        rate_limiter=rate_limiter,
        image_processor=image_processor,
        surface_styler=surface_styler,
        retention=settings.max_stored_planets,
    )
    get_current_planet = GetCurrentPlanetUseCase(repository)
    get_planet = GetPlanetByIdUseCase(
        repository,
        max_scan=settings.max_stored_planets,
    )
    get_current_scene = GetCurrentSceneUseCase(
        repository,
        max_planets=settings.gallery_size,
    )
    list_recent_planets = ListRecentPlanetsUseCase(
        repository,
        max_limit=settings.max_stored_planets,
    )
    delete_planet = DeletePlanetUseCase(
        repository=repository, publisher=publisher
    )
    clear_planets = ClearPlanetsUseCase(
        repository=repository, publisher=publisher
    )
    get_behavior = GetGalaxyBehaviorUseCase(
        behavior_repository,
        clock,
        seasonal_resolver,
    )
    update_behavior = UpdateGalaxyBehaviorUseCase(
        behavior_repository,
        publisher,
        clock,
        seasonal_resolver,
    )

    galaxy = Galaxy(name=settings.galaxy_name)
    advertiser = (
        ZeroconfServiceAdvertiser(
            galaxy,
            settings.port,
            scheme=settings.advertise_scheme,
        )
        if settings.advertise
        else NullServiceAdvertiser()
    )

    @contextlib.asynccontextmanager
    async def lifespan(_app: FastAPI):
        advertiser.start()
        try:
            yield
        finally:
            advertiser.stop()

    app = FastAPI(
        lifespan=lifespan,
        title="Kids Galaxy Projector",
        description="Secure backend for the kid planet drawing project",
        version="1.5.0",
        docs_url="/docs" if settings.is_development else None,
        redoc_url=None,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(settings.allowed_origins),
        allow_credentials=False,
        allow_methods=["GET", "POST", "PUT", "DELETE"],
        allow_headers=["*"],
    )

    if settings.static_dir.is_dir():
        app.mount(
            "/static",
            StaticFiles(directory=settings.static_dir),
            name="static",
        )
    else:
        logger.warning("Static directory %s not found", settings.static_dir)

    app.include_router(
        build_router(
            submit_planet=submit_planet,
            get_current_planet=get_current_planet,
            get_current_scene=get_current_scene,
            get_planet=get_planet,
            list_recent_planets=list_recent_planets,
            delete_planet=delete_planet,
            clear_planets=clear_planets,
            get_behavior=get_behavior,
            update_behavior=update_behavior,
            repository=repository,
            export_renderer=export_renderer,
            publisher=publisher,
            settings_galaxy=galaxy,
            authorizer=authorizer,
            settings=settings,
        )
    )

    app.state.settings = settings
    app.state.repository = repository
    app.state.behavior_repository = behavior_repository
    app.state.publisher = publisher
    app.state.rate_limiter = rate_limiter
    app.state.galaxy = galaxy
    app.state.advertiser = advertiser
    app.state.authorizer = authorizer
    return app
