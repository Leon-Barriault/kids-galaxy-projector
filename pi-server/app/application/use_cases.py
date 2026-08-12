"""Application layer: orchestration only.

This module contains the use cases that coordinate domain rules and ports.
Each use case is a thin orchestrator: it validates inputs via domain functions,
calls the appropriate ports in the correct order, and returns domain objects
or simple payload dictionaries. No framework (FastAPI, Pillow, filesystem)
imports are allowed here.
"""

import uuid

from app.application.events import GalaxyCleared, PlanetCreated, PlanetRemoved
from app.domain.drawing_manifest import normalize_drawing_manifest
from app.domain.errors import NotFoundError, ValidationError
from app.domain.image_rules import (
    ensure_content_type_allowed,
    ensure_not_empty,
    ensure_recognised_image,
    ensure_size_within,
)
from app.domain.naming import normalize_display_name
from app.domain.planet import NO_PLANET_PAYLOAD, Planet
from app.domain.planet_customization import (
    normalize_body_color,
    normalize_companions,
    normalize_crater_color,
    normalize_mountain_color,
    normalize_planet_style,
    normalize_ring_color,
)
from app.domain.scene import Scene
from app.ports import EventPublisher, ImageProcessor, PlanetRepository, RateLimiter

DEFAULT_MAX_SIZE = 5 * 1024 * 1024
DEFAULT_MAX_DIMENSION = 2048
DEFAULT_TARGET_SIZE = 1024
DEFAULT_RETENTION = 30
DEFAULT_GALLERY_SIZE = 12


class SubmitPlanetUseCase:
    """Orchestrates the manifest-backed child-draws-a-planet workflow."""

    def __init__(
        self,
        repository: PlanetRepository,
        publisher: EventPublisher,
        rate_limiter: RateLimiter,
        image_processor: ImageProcessor,
        retention: int = DEFAULT_RETENTION,
    ):
        self._repository = repository
        self._publisher = publisher
        self._rate_limiter = rate_limiter
        self._image_processor = image_processor
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
        raw_crater_color: str | None = None,
        raw_mountain_color: str | None = None,
        raw_body_color: str | None = None,
        drawing_manifest_bytes: bytes | None = None,
        max_size: int = DEFAULT_MAX_SIZE,
        max_dimension: int = DEFAULT_MAX_DIMENSION,
        target_size: int = DEFAULT_TARGET_SIZE,
    ) -> Planet:
        """Validate and persist one archival PNG plus its drawing-intent manifest."""
        self._rate_limiter.check(client_key)
        ensure_content_type_allowed(content_type)
        ensure_not_empty(len(image_bytes))
        ensure_size_within(len(image_bytes), max_size)
        ensure_recognised_image(image_bytes)

        drawing_manifest = normalize_drawing_manifest(drawing_manifest_bytes)
        if drawing_manifest is None:
            raise ValidationError("Drawing manifest is required.")

        style = normalize_planet_style(raw_style)
        companions = normalize_companions(raw_companions)
        body_color = normalize_body_color(raw_body_color)
        ring_color = normalize_ring_color(raw_ring_color)
        crater_color = normalize_crater_color(raw_crater_color)
        mountain_color = normalize_mountain_color(raw_mountain_color)

        manifest_background = drawing_manifest["background_color"]
        if body_color is not None and body_color != manifest_background:
            raise ValidationError("Drawing manifest background does not match body colour.")
        body_color = manifest_background

        # The PNG is archival/display data. Re-encoding strips metadata and
        # bounds the image dimensions, but no server-side stylistic transform is
        # allowed to reinterpret the child's authored pixels. The manifest owns
        # all projector and lithophane rendering intent.
        clean_png = self._image_processor.normalize_to_png(
            image_bytes,
            max_dimension=max_dimension,
            target_size=target_size,
        )

        display_name = normalize_display_name(raw_name)
        planet_id = uuid.uuid4().hex[:10]
        planet = self._repository.save_designed_with_manifest(
            planet_id=planet_id,
            display_name=display_name,
            image_bytes=clean_png,
            style=style,
            companions=companions,
            drawing_manifest=drawing_manifest,
            ring_color=ring_color,
            crater_color=crater_color,
            mountain_color=mountain_color,
            body_color=body_color,
        )
        self._rate_limiter.record(client_key)
        self._repository.prune(keep=self._retention)
        self._publisher.publish(PlanetCreated(planet))
        return planet


class GetCurrentPlanetUseCase:
    """Return the single most-recently uploaded planet or the empty payload."""

    def __init__(self, repository: PlanetRepository):
        self._repository = repository

    def execute(self) -> dict:
        planet = self._repository.latest()
        return planet.to_payload() if planet else NO_PLANET_PAYLOAD


class GetPlanetByIdUseCase:
    """Look up one retained planet for manager-only operations."""

    def __init__(self, repository: PlanetRepository, max_scan: int = DEFAULT_RETENTION):
        self._repository = repository
        self._max_scan = max_scan

    def execute(self, planet_id: str) -> Planet:
        for planet in self._repository.recent(self._max_scan):
            if planet.id == planet_id:
                return planet
        raise NotFoundError()


class GetCurrentSceneUseCase:
    """Build an immutable Scene snapshot of the planets currently in the sky."""

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
    """Return recent planets for the manager UI."""

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
    """Remove a single planet by id and notify all connected projectors."""

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
    """Remove every stored planet and broadcast one clear event."""

    def __init__(self, repository: PlanetRepository, publisher: EventPublisher):
        self._repository = repository
        self._publisher = publisher

    def execute(self) -> int:
        removed = self._repository.clear()
        self._publisher.publish(GalaxyCleared())
        return len(removed)
