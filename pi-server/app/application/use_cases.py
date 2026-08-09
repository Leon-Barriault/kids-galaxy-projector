"""Application layer: orchestration only.

This module contains the use cases that coordinate domain rules and ports.
Each use case is a thin orchestrator: it validates inputs via domain functions,
calls the appropriate ports in the correct order, and returns domain objects
or simple payload dictionaries. No framework (FastAPI, Pillow, filesystem)
imports are allowed here.
"""

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

# Default limits used when the caller does not supply explicit values.
# These are also the values the composition root (factory) typically injects.
DEFAULT_MAX_SIZE = 5 * 1024 * 1024          # 5 MiB upload ceiling
DEFAULT_MAX_DIMENSION = 2048                # longest side of incoming image
DEFAULT_TARGET_SIZE = 1024                  # size the image processor targets
DEFAULT_RETENTION = 30                      # planets kept on disk after prune
DEFAULT_GALLERY_SIZE = 12                   # planets shown in the live sky


class SubmitPlanetUseCase:
    """Orchestrates the full "child draws a planet" workflow.

    Ordering guarantees (important for correctness and resource protection):

    1. Rate-limit check (cheapest rejection first).
    2. Domain image acceptance rules (content-type, emptiness, size, magic bytes).
    3. Style / companion / ring-color normalisation (domain validation).
    4. Image re-encoding + security sanitisation (ImageProcessor).
    5. Cosmetic surface styling (SurfaceStyler) – only after security re-encode.
    6. Persist the planet (classic or designed path).
    7. Record the successful upload for the rate limiter.
    8. Prune old planets so disk usage stays bounded.
    9. Publish a PlanetCreated event so connected projectors update live.

    The use case never touches HTTP status codes or filesystem paths directly.
    """

    def __init__(
        self,
        repository: PlanetRepository,
        publisher: EventPublisher,
        rate_limiter: RateLimiter,
        image_processor: ImageProcessor,
        surface_styler: SurfaceStyler,
        retention: int = DEFAULT_RETENTION,
    ):
        """Wire the required ports.

        Args:
            repository: Persistence port for planets.
            publisher: Fan-out of domain events to SSE / other adapters.
            rate_limiter: Per-client cooldown enforcement.
            image_processor: Security-normalising image pipeline.
            surface_styler: Cosmetic treatment applied after security re-encode.
            retention: How many planets to keep on disk after each upload.
        """
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
        """Accept a child's drawing and turn it into a stored, projected planet.

        Args:
            image_bytes: Raw bytes of the uploaded image (PNG or JPEG).
            content_type: Declared Content-Type header (untrusted; validated).
            raw_name: Free-text name the child typed (will be normalised).
            client_key: Stable identifier used by the rate limiter (usually IP
                or certificate subject).
            raw_style: Optional planet style string ("classic", "ringed", …).
            raw_companions: Optional comma-separated companions ("moon,stars").
            raw_ring_color: Optional CSS hex colour for the ring (when style=ringed).
            max_size: Hard ceiling on upload size in bytes.
            max_dimension: Maximum allowed width or height of the source image.
            target_size: Size the ImageProcessor should target when resizing.

        Returns:
            The newly created Planet entity (already persisted).

        Raises:
            RateLimitedError: Client is still inside its cooldown window.
            ImageValidationError / ValidationError: Domain rule violated.
        """
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
        # Surface styling must run *after* the security re-encode so the styler
        # only ever sees bytes that the image processor has already vouched for.
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
    """Return the single most-recently uploaded planet (or the empty payload).

    Used by the legacy "current planet" endpoint and by clients that only care
    about the newest drawing.
    """

    def __init__(self, repository: PlanetRepository):
        self._repository = repository

    def execute(self) -> dict:
        """Return the wire-format payload of the latest planet, or NO_PLANET_PAYLOAD."""
        planet = self._repository.latest()
        return planet.to_payload() if planet else NO_PLANET_PAYLOAD


class GetCurrentSceneUseCase:
    """Build an immutable Scene snapshot of the planets currently in the sky.

    The gallery size is intentionally smaller than the on-disk retention limit
    so the projector never tries to render more planets than it can handle.
    """

    def __init__(self, repository: PlanetRepository, max_planets: int = DEFAULT_GALLERY_SIZE):
        self._repository = repository
        self._max_planets = max_planets

    def execute(self) -> Scene:
        """Return a Scene containing the newest planets (newest first)."""
        return Scene(planets=tuple(self._repository.recent(self._max_planets)))


class ListRecentPlanetsUseCase:
    """Return a paginated-style list of recent planets for the manager UI.

    The absolute ceiling is the retention limit (not the gallery size) so the
    manager can see every planet that is still on disk.
    """

    def __init__(self, repository: PlanetRepository, max_limit: int = DEFAULT_GALLERY_SIZE):
        self._repository = repository
        self._max_limit = max_limit

    def execute(self, limit: int | None = None) -> dict:
        """Return {"planets": [...]} with at most `limit` (or max_limit) entries.

        Args:
            limit: Optional client-requested limit. Capped at self._max_limit.

        Returns:
            Dictionary with a single key "planets" containing payload dicts,
            newest first.
        """
        effective = self._max_limit if limit is None else min(limit, self._max_limit)
        planets = self._repository.recent(effective)
        return {"planets": [planet.to_payload() for planet in planets]}


class DeletePlanetUseCase:
    """Remove a single planet by id and notify all connected projectors.

    A successful delete publishes a PlanetRemoved event on the same SSE
    channel that carries arrivals, so the projector can react uniformly.
    """

    def __init__(self, repository: PlanetRepository, publisher: EventPublisher):
        self._repository = repository
        self._publisher = publisher

    def execute(self, planet_id: str) -> Planet:
        """Delete the planet identified by `planet_id`.

        Args:
            planet_id: The short hex id returned at upload time.

        Returns:
            The deleted Planet entity (useful for confirmation messages).

        Raises:
            NotFoundError: No planet with that id exists (or it was already removed).
        """
        planet = self._repository.delete(planet_id)
        if planet is None:
            raise NotFoundError()
        self._publisher.publish(PlanetRemoved(planet.id))
        return planet


class ClearPlanetsUseCase:
    """Remove every stored planet in one operation and broadcast a clear event.

    A single GalaxyCleared event is preferred over a loop of individual
    PlanetRemoved events so the projector empties the sky in one frame
    instead of flickering through a cascade of disposals.
    """

    def __init__(self, repository: PlanetRepository, publisher: EventPublisher):
        self._repository = repository
        self._publisher = publisher

    def execute(self) -> int:
        """Clear the entire galaxy.

        Returns:
            The number of planets that were removed.
        """
        removed = self._repository.clear()
        self._publisher.publish(GalaxyCleared())
        return len(removed)
