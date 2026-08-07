"""
Composition root.

The only place where concrete adapters are chosen and wired to the ports the
application layer depends on. Swapping storage or transport is a change here
and nowhere else.
"""

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.routes import build_router
from app.application.use_cases import GetCurrentPlanetUseCase, SubmitPlanetUseCase
from app.config import Settings
from app.infrastructure.event_publisher import InMemoryEventPublisher
from app.infrastructure.filesystem_repository import FileSystemPlanetRepository
from app.infrastructure.image_processor import PillowImageProcessor
from app.infrastructure.rate_limiter import InMemoryRateLimiter

logger = logging.getLogger("kids-galaxy")


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings.from_env()
    logging.basicConfig(level=logging.INFO)

    # ---- adapters (infrastructure) ----
    repository = FileSystemPlanetRepository(settings.upload_dir)
    publisher = InMemoryEventPublisher()
    rate_limiter = InMemoryRateLimiter(cooldown_seconds=settings.rate_limit_seconds)
    image_processor = PillowImageProcessor()

    # ---- use cases (application) ----
    submit_planet = SubmitPlanetUseCase(
        repository=repository,
        publisher=publisher,
        rate_limiter=rate_limiter,
        image_processor=image_processor,
        retention=settings.max_stored_planets,
    )
    get_current_planet = GetCurrentPlanetUseCase(repository)

    # ---- transport (API) ----
    app = FastAPI(
        title="Kids Galaxy Projector",
        description="Secure backend for the kid planet drawing project",
        version="1.1.0",
        # API docs stay off outside development: this runs on a tablet-facing
        # hotspot and there is no reason to publish a schema explorer there.
        docs_url="/docs" if settings.is_development else None,
        redoc_url=None,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(settings.allowed_origins),
        allow_credentials=False,
        allow_methods=["GET", "POST"],
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
            repository=repository,
            publisher=publisher,
            settings=settings,
        )
    )

    # Exposed for tests and for operational introspection.
    app.state.settings = settings
    app.state.repository = repository
    app.state.publisher = publisher
    app.state.rate_limiter = rate_limiter

    return app
