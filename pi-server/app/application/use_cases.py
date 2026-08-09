"""Application layer: orchestration only."""

import uuid

from app.application.events import GalaxyCleared, PlanetCreated, PlanetRemoved
from app.domain.errors import NotFoundError
from app.domain.image_rules import (
    ensure_content_type_allowed,
    ensure_not_empty,
    ensure_recognised_image,
    ensure_size_within,
)
from app.domain.naming import normalize_display_name
from app.domain.planet import NO_PLANET_PAYLOAD, Planet
from app.domain.planet_customization import (
    normalize_companions,
    normalize_planet_style,
    normalize_ring_color,
)
from app.domain.scene import Scene
from app.ports import EventPublisher, ImageProcessor, PlanetRepository, RateLimiter, SurfaceStyler

DEFAULT_MAX_SIZE = 5 * 1024 * 1024
DEFAULT_MAX_DIMENSION = 2048
DEFAULT_TARGET_SIZE = 1024
DEFAULT_RETENTION = 30
DEFAULT_GALLERY_SIZE = 12


class SubmitPlanetUseCase:
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
        raw_style: str | None = None,
        raw_companions: str | None = None,
        raw_ring_color: str | None = None,
        max_size: int = DEFAULT_MAX_SIZE,
        max_dimension: int = DEFAULT_MAX_DIMENSION,
        target_size: int = DEFAULT_TARGET_SIZE,
    ) -> Planet:
        self._rate_limiter.check(client_key)
        ensure_content_type_allowed(content_type)
        ensure_not_empty(len(image_bytes))
        ensure_size_within(len(image_bytes), max_size)
        ensure_recognised_image(image_bytes)

        style = normalize_planet_style(raw_style)
        companions = normalize_companions(raw_companions)
        ring_color = normalize_ring_color(raw_ring_color)

        clean_png = self._image_processor.normalize_to_png(
            image_bytes, max_dimension=max_dimension, target_size=target_size
        )
        clean_png = self._surface_styler.style(clean_png)

        display_name = normalize_display_name(raw_name)
        planet_id = uuid.uuid4().hex[:10]
        if style == "classic" and not companions:
            # Keep simple/legacy repository adapters valid for the original
            # planet contract. Rich designs intentionally require the newer
            # save_designed capability so their metadata cannot be discarded.
            planet = self._repository.save(
                planet_id=planet_id,
                display_name=display_name,
                image_bytes=clean_png,
            )
        else:
            planet = self._repository.save_designed(
                planet_id=planet_id,
                display_name=display_name,
                image_bytes=clean_png,
                style=style,
                companions=companions,
                ring_color=ring_color,
            )
        self._rate_limiter.record(client_key)
        self._repository.prune(keep=self._retention)
        self._publisher.publish(PlanetCreated(planet))
        return planet


class GetCurrentPlanetUseCase:
    def __init__(self, repository: PlanetRepository):
        self._repository = repository

    def execute(self) -> dict:
        planet = self._repository.latest()
        return planet.to_payload() if planet else NO_PLANET_PAYLOAD


class GetCurrentSceneUseCase:
    def __init__(self, repository: PlanetRepository, max_planets: int = DEFAULT_GALLERY_SIZE):
        self._repository = repository
        self._max_planets = max_planets

    def execute(self) -> Scene:
        return Scene(planets=tuple(self._repository.recent(self._max_planets)))


class ListRecentPlanetsUseCase:
    def __init__(self, repository: PlanetRepository, max_limit: int = DEFAULT_GALLERY_SIZE):
        self._repository = repository
        self._max_limit = max_limit

    def execute(self, limit: int | None = None) -> dict:
        effective = self._max_limit if limit is None else min(limit, self._max_limit)
        planets = self._repository.recent(effective)
        return {"planets": [planet.to_payload() for planet in planets]}


class DeletePlanetUseCase:
    def __init__(self, repository: PlanetRepository, publisher: EventPublisher):
        self._repository = repository
        self._publisher = publisher

    def execute(self, planet_id: str) -> Planet:
        planet = self._repository.delete(planet_id)
        if planet is None:
            raise NotFoundError()
        self._publisher.publish(PlanetRemoved(planet.id))
        return planet


class ClearPlanetsUseCase:
    def __init__(self, repository: PlanetRepository, publisher: EventPublisher):
        self._repository = repository
        self._publisher = publisher

    def execute(self) -> int:
        removed = self._repository.clear()
        self._publisher.publish(GalaxyCleared())
        return len(removed)
