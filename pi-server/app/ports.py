"""
Ports: the abstractions the application layer depends on.

Dependency inversion lives here. Use cases are written against these
interfaces, and `app.infrastructure` supplies the concrete adapters, so the
orchestration logic can be tested with fakes and the storage or transport can
be swapped without touching business rules.
"""

from abc import ABC, abstractmethod
from contextlib import AbstractAsyncContextManager
from pathlib import Path

from app.domain.planet import Planet


class PlanetRepository(ABC):
    """Persistence for planet drawings."""

    @abstractmethod
    def save(self, planet_id: str, display_name: str, image_bytes: bytes) -> Planet:
        """Store the image plus its display name and return the entity."""

    @abstractmethod
    def latest(self) -> Planet | None:
        """Most recently stored planet, or None if there are none."""

    @abstractmethod
    def prune(self, keep: int) -> None:
        """Delete all but the newest `keep` planets."""

    @abstractmethod
    def resolve_image(self, filename: str) -> Path | None:
        """
        Map a requested filename to a real path inside the store.

        Returns None if it does not exist or would escape the directory.
        """


class EventPublisher(ABC):
    """Fan-out of planet updates to connected projectors."""

    @abstractmethod
    def publish(self, payload: dict) -> None:
        """Deliver a payload to all subscribers. Must never block the caller."""

    @abstractmethod
    def subscribe(self) -> AbstractAsyncContextManager:
        """Async context manager yielding a queue of payloads."""


class RateLimiter(ABC):
    """Per-client cooldown."""

    @abstractmethod
    def check(self, key: str) -> None:
        """Raise RateLimitedError if `key` is still within its cooldown."""


class ImageProcessor(ABC):
    """Turns untrusted upload bytes into a safe, normalised PNG."""

    @abstractmethod
    def normalize_to_png(
        self, content: bytes, max_dimension: int, target_size: int
    ) -> bytes:
        """
        Validate integrity and re-encode as a clean PNG.

        Re-encoding is a security control: it drops any metadata or payload
        smuggled inside the original file.
        """
