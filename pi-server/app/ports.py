"""Ports: abstractions the application layer depends on.

These interfaces define the contracts between the application (use-case)
layer and the outside world. Concrete implementations live in the
infrastructure package. The application layer must never import concrete
adapters; it only depends on these ports.

Keeping the ports here (rather than inside the domain) allows the domain
to stay free of any knowledge of persistence, events, rate-limiting, or
image processing.
"""

from abc import ABC, abstractmethod
from contextlib import AbstractAsyncContextManager
from datetime import date
from pathlib import Path

from app.application.event_types import ApplicationEvent
from app.domain.behavior import GalaxyBehaviorSettings
from app.domain.planet import Planet


class PlanetRepository(ABC):
    """Persistence port for Planet entities.

    Implementations are responsible for:
    - Storing the PNG bytes + sidecar metadata
    - Generating stable, unique filenames
    - Guaranteeing that delete / prune / clear are atomic enough for the
      single-writer nature of the Pi server
    """

    @abstractmethod
    def save(self, planet_id: str, display_name: str, image_bytes: bytes) -> Planet:
        """Store a classic image plus its display name and return the entity.

        This is the minimal contract required by legacy / simple adapters.
        """

    def save_designed(
        self,
        planet_id: str,
        display_name: str,
        image_bytes: bytes,
        style: str,
        companions: tuple[str, ...],
        ring_color: str,
    ) -> Planet:
        """Store richer design metadata; legacy adapters fall back to classic saves.

        Default implementation simply calls save(), discarding the extra
        fields. Concrete adapters that understand styles/companions override
        this method.
        """
        return self.save(planet_id, display_name, image_bytes)

    @abstractmethod
    def latest(self) -> Planet | None:
        """Most recently stored planet, or None if there are none."""

    @abstractmethod
    def recent(self, limit: int) -> list[Planet]:
        """Newest `limit` planets, newest first.

        Implementations should return an empty list when nothing is stored.
        """

    @abstractmethod
    def clear(self) -> list[Planet]:
        """Remove every stored planet and return what was removed.

        The returned list is useful for logging / confirmation messages.
        """

    @abstractmethod
    def prune(self, keep: int) -> None:
        """Delete all but the newest `keep` planets.

        Called after every successful upload so disk usage stays bounded.
        """

    @abstractmethod
    def delete(self, planet_id: str) -> Planet | None:
        """Remove one planet by id, returning it when found.

        Returns None when the id does not exist (caller decides whether that
        is an error).
        """

    @abstractmethod
    def resolve_image(self, filename: str) -> Path | None:
        """Resolve a public image filename inside the backing store.

        Used by the static file serving path. Must reject path-traversal
        attempts (return None for anything that escapes the upload root).
        """


class BehaviorRepository(ABC):
    """Persistence for operator-selected galaxy behaviour settings."""

    @abstractmethod
    def load(self) -> GalaxyBehaviorSettings:
        """Load persisted projector behavior settings or their defaults."""

    @abstractmethod
    def save(self, settings: GalaxyBehaviorSettings) -> None:
        """Persist operator-selected behavior settings."""


class Clock(ABC):
    """Abstraction over the system calendar.

    Injected so seasonal theme resolution can be tested deterministically.
    """

    @abstractmethod
    def today(self) -> date:
        """Return the Pi's current local calendar day."""


class EventPublisher(ABC):
    """Fan-out of typed application events to connected adapters.

    Typical concrete implementation is an in-memory pub/sub that feeds the
    Server-Sent Events endpoint.
    """

    @abstractmethod
    def publish(self, event: ApplicationEvent) -> None:
        """Deliver an event to all subscribers without blocking the caller."""

    @abstractmethod
    def subscribe(self) -> AbstractAsyncContextManager:
        """Async context manager yielding a queue of ApplicationEvent values.

        The returned context manager must clean up the subscription when the
        async with block exits.
        """


class RateLimiter(ABC):
    """Per-client upload cooldown.

    Protects the Pi from rapid-fire uploads that would fill disk or starve
    the image-processing pipeline.
    """

    @abstractmethod
    def check(self, key: str) -> None:
        """Raise when `key` is still within its cooldown.

        Implementations should raise a domain RateLimitedError (or subclass).
        """

    @abstractmethod
    def record(self, key: str) -> None:
        """Mark a successful upload, starting this client's cooldown."""


class SurfaceStyler(ABC):
    """Cosmetic treatment applied to a security-normalised PNG.

    Implementations must never raise: styling is best-effort. A failure
    should return the original bytes unchanged so the upload still succeeds.
    """

    @abstractmethod
    def style(self, png_bytes: bytes) -> bytes:
        """Apply cosmetic planet-surface treatment. Implementations must not raise."""


class ServiceAdvertiser(ABC):
    """Publishes the galaxy on the local network (mDNS / Zeroconf)."""

    @abstractmethod
    def start(self) -> None:
        """Publish this galaxy on the local network."""

    @abstractmethod
    def stop(self) -> None:
        """Withdraw the local-network advertisement."""


class ImageProcessor(ABC):
    """Security-normalising image pipeline.

    Responsibilities:
    - Decode the uploaded bytes
    - Reject images that exceed dimension limits
    - Re-encode to a clean PNG (strips metadata, colour profiles, etc.)
    - Optionally resize to a target size suitable for the projector
    """

    @abstractmethod
    def normalize_to_png(
        self,
        image_bytes: bytes,
        max_dimension: int,
        target_size: int,
    ) -> bytes:
        """Decode, validate dimensions and return a normalized PNG."""
