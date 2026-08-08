"""
Application layer: orchestration only.

These use cases sequence the domain rules and the ports. They contain no
framework code, no filesystem access and no image library calls, which is why
they can be fully tested with in-memory doubles.
"""

import uuid

from app.domain.image_rules import (
    ensure_content_type_allowed,
    ensure_not_empty,
    ensure_recognised_image,
    ensure_size_within,
)
from app.domain.naming import normalize_display_name
from app.domain.planet import NO_PLANET_PAYLOAD, Planet
from app.ports import EventPublisher, ImageProcessor, PlanetRepository, RateLimiter

DEFAULT_MAX_SIZE = 5 * 1024 * 1024
DEFAULT_MAX_DIMENSION = 2048
DEFAULT_TARGET_SIZE = 1024
DEFAULT_RETENTION = 30

#: How many planets orbit at once. Retention (30) is about disk; this is about
#: what a projector can show and a room can follow. The store deliberately
#: keeps more than the sky shows.
DEFAULT_GALLERY_SIZE = 12


class SubmitPlanetUseCase:
    """
    Accept a drawing from a tablet.

    Order matters:
    * the cooldown is *checked* before any expensive work,
    * but only *recorded* once the planet is stored - a rejected drawing must not
      make the child wait,
    * and the projector is notified only after the planet is durably stored.
    """

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
        max_size: int = DEFAULT_MAX_SIZE,
        max_dimension: int = DEFAULT_MAX_DIMENSION,
        target_size: int = DEFAULT_TARGET_SIZE,
    ) -> Planet:
        # 1. Cheapest rejection first - no image work for a throttled client.
        #    This only queries; the cooldown starts at step 5.
        self._rate_limiter.check(client_key)

        # 2. Domain rules on the raw upload.
        ensure_content_type_allowed(content_type)
        ensure_not_empty(len(image_bytes))
        ensure_size_within(len(image_bytes), max_size)
        ensure_recognised_image(image_bytes)

        # 3. Re-encode: strips hostile metadata and normalises the texture.
        clean_png = self._image_processor.normalize_to_png(
            image_bytes, max_dimension=max_dimension, target_size=target_size
        )

        # 4. Persist, keeping the child's name verbatim.
        display_name = normalize_display_name(raw_name)
        planet = self._repository.save(
            planet_id=uuid.uuid4().hex[:10],
            display_name=display_name,
            image_bytes=clean_png,
        )

        # 5. The drawing is stored, so the cooldown may now start. Doing this
        #    after storage means a rejected upload costs the child nothing.
        self._rate_limiter.record(client_key)

        # 6. Bound disk usage, then tell the projector - in that order, so a
        #    prune failure cannot leave the projector pointing at a deleted file.
        self._repository.prune(keep=self._retention)
        self._publisher.publish(planet.to_payload())

        return planet


class GetCurrentPlanetUseCase:
    """Report the planet the projector should currently be showing."""

    def __init__(self, repository: PlanetRepository):
        self._repository = repository

    def execute(self) -> dict:
        planet = self._repository.latest()
        return planet.to_payload() if planet else NO_PLANET_PAYLOAD


class ListRecentPlanetsUseCase:
    """
    The projector's gallery.

    Every drawing now becomes its own planet, so on load the projector needs
    the whole visible set rather than only the newest one - otherwise
    refreshing the page would empty a sky that took an afternoon to fill.

    `max_limit` is a ceiling, not a suggestion. The query parameter behind it
    is caller-controlled, and leaving it unbounded would turn this into a way
    to enumerate and re-read the entire store in one request.
    """

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
