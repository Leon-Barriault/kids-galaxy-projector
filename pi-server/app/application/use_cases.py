"""
Application layer: orchestration only.

These use cases sequence the domain rules and the ports. They contain no
framework code, no filesystem access and no image library calls, which is why
they can be fully tested with in-memory doubles.
"""

import uuid

from app.domain.errors import NotFoundError
from app.domain.image_rules import (
    ensure_content_type_allowed,
    ensure_not_empty,
    ensure_recognised_image,
    ensure_size_within,
)
from app.domain.naming import normalize_display_name
from app.domain.planet import NO_PLANET_PAYLOAD, Planet
from app.domain.scene import Scene
from app.ports import (
    EventPublisher,
    ImageProcessor,
    PlanetRepository,
    RateLimiter,
    SurfaceStyler,
)

DEFAULT_MAX_SIZE = 5 * 1024 * 1024
DEFAULT_MAX_DIMENSION = 2048
DEFAULT_TARGET_SIZE = 1024
DEFAULT_RETENTION = 30

#: How many planets orbit at once. Retention (30) is about disk; this is about
#: what a projector can show and a room can follow. The store deliberately
#: keeps more than the sky shows.
DEFAULT_GALLERY_SIZE = 12


class SubmitPlanetUseCase:
    """Accept, validate, normalise, style, store and publish a drawing."""

    def __init__(
        self,
        repository: PlanetRepository,
        publisher: EventPublisher,
        rate_limiter: RateLimiter,
        image_processor: ImageProcessor,
        surface_styler: SurfaceStyler,
        retention: int = DEFAULT_RETENTION,
    ):
        self._repository = repository
        self._publisher = publisher
        self._rate_limiter = rate_limiter
        self._image_processor = image_processor
        self._surface_styler = surface_styler
        self._retention = retention

    def execute(
        self,
        image_bytes: bytes,
        content_type: str | None,
        raw_name: str,
        client_key: str,
        max_size: int = DEFAULT_MAX_SIZE,
        max_dimension: int = DEFAULT_MAX_DIMENSION,
        target_size: int = DEFAULT_TARGET_SIZE,
    ) -> Planet:
        self._rate_limiter.check(client_key)
        ensure_content_type_allowed(content_type)
        ensure_not_empty(len(image_bytes))
        ensure_size_within(len(image_bytes), max_size)
        ensure_recognised_image(image_bytes)

        clean_png = self._image_processor.normalize_to_png(
            image_bytes, max_dimension=max_dimension, target_size=target_size
        )
        clean_png = self._surface_styler.style(clean_png)

        display_name = normalize_display_name(raw_name)
        planet = self._repository.save(
            planet_id=uuid.uuid4().hex[:10],
            display_name=display_name,
            image_bytes=clean_png,
        )
        self._rate_limiter.record(client_key)
        self._repository.prune(keep=self._retention)
        self._publisher.publish(planet.to_payload())
        return planet


class GetCurrentPlanetUseCase:
    """Report the newest planet for compatibility clients and SSE priming."""

    def __init__(self, repository: PlanetRepository):
        self._repository = repository

    def execute(self) -> dict:
        planet = self._repository.latest()
        return planet.to_payload() if planet else NO_PLANET_PAYLOAD


class GetCurrentSceneUseCase:
    """Return the immutable set of planets the projector should render now."""

    def __init__(
        self,
        repository: PlanetRepository,
        max_planets: int = DEFAULT_GALLERY_SIZE,
    ):
        self._repository = repository
        self._max_planets = max_planets

    def execute(self) -> Scene:
        return Scene(planets=tuple(self._repository.recent(self._max_planets)))


class ListRecentPlanetsUseCase:
    """Return recent planets in the legacy gallery wire format."""

    def __init__(
        self,
        repository: PlanetRepository,
        max_limit: int = DEFAULT_GALLERY_SIZE,
    ):
        self._repository = repository
        self._max_limit = max_limit

    def execute(self, limit: int | None = None) -> dict:
        effective = self._max_limit if limit is None else min(limit, self._max_limit)
        planets = self._repository.recent(effective)
        return {"planets": [planet.to_payload() for planet in planets]}


class DeletePlanetUseCase:
    """Remove one planet from the store and tell connected projectors."""

    def __init__(self, repository: PlanetRepository, publisher: EventPublisher):
        self._repository = repository
        self._publisher = publisher

    def execute(self, planet_id: str) -> Planet:
        planet = self._repository.delete(planet_id)
        if planet is None:
            raise NotFoundError()
        self._publisher.publish(
            {"has_planet": False, "id": planet.id, "removed": True}
        )
        return planet


class ClearPlanetsUseCase:
    """Empty the sky and broadcast one reconciliation event."""

    def __init__(self, repository: PlanetRepository, publisher: EventPublisher):
        self._repository = repository
        self._publisher = publisher

    def execute(self) -> int:
        removed = self._repository.clear()
        self._publisher.publish({"has_planet": False, "cleared": True})
        return len(removed)
