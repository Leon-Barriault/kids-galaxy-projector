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
    def recent(self, limit: int) -> list[Planet]:
        """
        The newest `limit` planets, newest first.

        The projector shows a gallery rather than a single planet, so it needs
        the whole set on load - `latest()` alone would empty the sky on every
        page reload. A limit of zero or less returns an empty list.
        """

    @abstractmethod
    def clear(self) -> list[Planet]:
        """
        Remove every stored planet and return what was removed.

        Returning the planets rather than a count keeps the use case able to
        report and log what actually went, and keeps the port symmetric with
        delete().
        """

    @abstractmethod
    def prune(self, keep: int) -> None:
        """Delete all but the newest `keep` planets."""

    @abstractmethod
    def delete(self, planet_id: str) -> Planet | None:
        """
        Remove one planet by id.

        Returns the deleted entity so callers can publish a removal event, or
        None if no planet with that id exists.
        """

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
    """
    Per-client cooldown, split into a pure query and an explicit mark.

    Separating them means a rejected upload does not consume the client's
    cooldown - nothing was stored, so nothing should be throttled.
    """

    @abstractmethod
    def check(self, key: str) -> None:
        """Raise RateLimitedError if `key` is still within its cooldown."""

    @abstractmethod
    def record(self, key: str) -> None:
        """Mark a successful upload, starting this client's cooldown."""


class SurfaceStyler(ABC):
    """
    Cosmetic pass that turns a drawing into a planet surface.

    Separate from ImageProcessor on purpose. That one is a security control -
    re-encoding to strip anything smuggled inside the upload - and mixing a
    look-and-feel decision into it would mean tuning the appearance of planets
    inside the code that defends the server.
    """

    @abstractmethod
    def style(self, png_bytes: bytes) -> bytes:
        """
        Return a styled PNG. Must never raise: styling is cosmetic, and a
        planet that looks like paper beats an upload that fails.
        """


class ImageProcessor(ABC):
    """Normalise uploaded images into a safe, fixed-size PNG texture."""

    @abstractmethod
    def normalize_to_png(
        self, content: bytes, max_dimension: int, target_size: int
    ) -> bytes:
        """Re-encode to PNG, capped and squared for the projector."""
