"""Ports: abstractions the application layer depends on."""

from abc import ABC, abstractmethod
from contextlib import AbstractAsyncContextManager
from datetime import date
from pathlib import Path

from app.application.event_types import ApplicationEvent
from app.domain.behavior import GalaxyBehaviorSettings
from app.domain.planet import Planet


class PlanetRepository(ABC):
    @abstractmethod
    def save(self, planet_id: str, display_name: str, image_bytes: bytes) -> Planet:
        """Store the image plus its display name and return the entity."""

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


class BehaviorRepository(ABC):
    @abstractmethod
    def load(self) -> GalaxyBehaviorSettings:
        """Load persisted projector behavior settings or their defaults."""

    @abstractmethod
    def save(self, settings: GalaxyBehaviorSettings) -> None:
        """Persist operator-selected behavior settings."""


class Clock(ABC):
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
    @abstractmethod
    def check(self, key: str) -> None:
        """Raise when `key` is still within its cooldown."""

    @abstractmethod
    def record(self, key: str) -> None:
        """Mark a successful upload, starting this client's cooldown."""


class SurfaceStyler(ABC):
    @abstractmethod
    def style(self, png_bytes: bytes) -> bytes:
        """Return a styled PNG; styling is cosmetic and must be resilient."""


class ServiceAdvertiser(ABC):
    @abstractmethod
    def start(self) -> None:
        """Begin advertising the galaxy on the local network."""

    @abstractmethod
    def stop(self) -> None:
        """Withdraw the local-network advertisement."""


class ImageProcessor(ABC):
    @abstractmethod
    def normalize_to_png(
        self, content: bytes, max_dimension: int, target_size: int
    ) -> bytes:
        """Re-encode to PNG, capped and squared for the projector."""
