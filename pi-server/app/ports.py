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
from app.domain.planet_customization import (
    DEFAULT_CRATER_COLOR,
    DEFAULT_MOUNTAIN_COLOR,
    DEFAULT_RING_COLOR,
)


class PlanetRepository(ABC):
    """Persistence port for Planet entities."""

    @abstractmethod
    def save(self, planet_id: str, display_name: str, image_bytes: bytes) -> Planet:
        """Store a classic image plus its display name and return the entity."""

    def save_designed(
        self,
        planet_id: str,
        display_name: str,
        image_bytes: bytes,
        style: str,
        companions: tuple[str, ...],
        ring_color: str = DEFAULT_RING_COLOR,
        crater_color: str = DEFAULT_CRATER_COLOR,
        mountain_color: str = DEFAULT_MOUNTAIN_COLOR,
        body_color: str | None = None,
    ) -> Planet:
        """Store richer design metadata; legacy adapters fall back to classic saves."""
        return self.save(planet_id, display_name, image_bytes)

    @abstractmethod
    def latest(self) -> Planet | None:
        """Most recently stored planet, or None if there are none."""

    @abstractmethod
    def recent(self, limit: int) -> list[Planet]:
        """Newest `limit` planets, newest first."""

    @abstractmethod
    def clear(self) -> list[Planet]:
        """Remove every stored planet and return what was removed."""

    @abstractmethod
    def prune(self, keep: int) -> None:
        """Delete all but the newest `keep` planets."""

    @abstractmethod
    def delete(self, planet_id: str) -> Planet | None:
        """Remove one planet by id, returning it when found."""

    @abstractmethod
    def resolve_image(self, filename: str) -> Path | None:
        """Resolve a public image filename inside the backing store."""


class PlanetExportRenderer(ABC):
    """Create authoritative Pi-side previews and printable planet exports."""

    def store_projector_snapshot(self, planet: Planet, png_bytes: bytes) -> None:
        """Persist a finalized WebGL hero image supplied by the projector browser."""
        raise NotImplementedError

    def has_projector_snapshot(self, planet: Planet) -> bool:
        """Whether the finalized WebGL hero image is ready for print/PDF export."""
        return False

    @abstractmethod
    def render_preview(self, planet: Planet, image_path: Path) -> bytes:
        """Return a PNG preview using the projector artwork projection contract."""

    @abstractmethod
    def render_print_sheet(self, planet: Planet, image_path: Path) -> bytes:
        """Return a PNG print sheet containing the Pi-rendered planet and kid drawing."""

    @abstractmethod
    def render_print_pdf(self, planet: Planet, image_path: Path) -> bytes:
        """Return the same Pi-rendered print sheet as a one-page PDF."""

    @abstractmethod
    def export_stl(
        self,
        planet: Planet,
        image_path: Path,
        diameter_mm: float,
    ) -> bytes:
        """Return a manifold spherical lithophane matching the projector mapping."""


class BehaviorRepository(ABC):
    """Persistence for operator-selected galaxy behaviour settings."""

    @abstractmethod
    def load(self) -> GalaxyBehaviorSettings:
        """Load persisted projector behavior settings or their defaults."""

    @abstractmethod
    def save(self, settings: GalaxyBehaviorSettings) -> None:
        """Persist operator-selected behavior settings or their defaults."""


class Clock(ABC):
    """Abstraction over the system calendar."""

    @abstractmethod
    def today(self) -> date:
        """Return the Pi's current local calendar day."""


class EventPublisher(ABC):
    """Fan-out of typed application events to connected adapters."""

    @abstractmethod
    def publish(self, event: ApplicationEvent) -> None:
        """Deliver an event to all subscribers without blocking the caller."""

    @abstractmethod
    def subscribe(self) -> AbstractAsyncContextManager:
        """Async context manager yielding a queue of ApplicationEvent values."""


class RateLimiter(ABC):
    """Per-client upload cooldown."""

    @abstractmethod
    def check(self, key: str) -> None:
        """Raise when `key` is still within this client's cooldown."""

    @abstractmethod
    def record(self, key: str) -> None:
        """Mark a successful upload, starting this client's cooldown."""


class SurfaceStyler(ABC):
    """Cosmetic treatment applied to a security-normalised PNG."""

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
    """Security-normalising image pipeline."""

    @abstractmethod
    def normalize_to_png(
        self,
        image_bytes: bytes,
        max_dimension: int,
        target_size: int,
    ) -> bytes:
        """Decode, validate dimensions and return a normalized PNG."""
