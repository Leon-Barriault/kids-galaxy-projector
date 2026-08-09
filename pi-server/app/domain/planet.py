"""
The Planet entity.

Immutable and framework-free. Owns the payload shape that both the REST
endpoint and the SSE stream emit, so the two can never drift apart.

A Planet represents one child's drawing after it has been accepted, sanitized,
optionally styled, and persisted. It carries both the technical identity
(id, filename) and the presentation choices the child made (name, style,
companions and feature colours).
"""

from dataclasses import dataclass
from pathlib import PurePosixPath

from app.domain.planet_customization import (
    DEFAULT_CRATER_COLOR,
    DEFAULT_MOUNTAIN_COLOR,
    DEFAULT_RING_COLOR,
)

#: Response when no child has drawn anything yet.
#: Shared constant so REST and SSE never diverge on the empty case.
NO_PLANET_PAYLOAD: dict = {"has_planet": False}


@dataclass(frozen=True)
class Planet:
    """A stored planet drawing plus the child's presentation choices.

    Attributes:
        id: Short unique identifier (hex) used in URLs and events.
        filename: On-disk name of the PNG texture (includes the id).
        display_name: Human-readable name shown on the projector and in the
            manager UI. Preserves the child's original punctuation and accents.
        created_at: Unix timestamp of creation (float seconds).
        style: One of the allowed planet styles ("classic", "ringed", …).
        companions: Ordered tuple of companion identifiers the child selected.
        ring_color: CSS hex colour used when style == "ringed".
        crater_color: CSS hex colour used when style == "cratered".
        mountain_color: CSS hex colour used when style == "spiky".
    """

    id: str
    filename: str
    display_name: str
    created_at: float
    style: str = "classic"
    companions: tuple[str, ...] = ()
    ring_color: str = DEFAULT_RING_COLOR
    crater_color: str = DEFAULT_CRATER_COLOR
    mountain_color: str = DEFAULT_MOUNTAIN_COLOR

    @property
    def url(self) -> str:
        """Public URL the projector loads the texture from.

        Always relative to the server root so the same payload works behind
        reverse proxies and on the local hotspot.
        """
        return f"/uploads/{self.filename}"

    @property
    def metadata_filename(self) -> str:
        """Sidecar JSON that preserves display and design metadata."""
        return PurePosixPath(self.filename).with_suffix(".json").name

    def to_payload(self) -> dict:
        """Wire format shared by REST scene endpoints and the SSE stream."""
        payload = {
            "has_planet": True,
            "id": self.id,
            "url": self.url,
            "name": self.display_name,
            "timestamp": self.created_at,
            "style": self.style,
            "companions": list(self.companions),
        }
        if self.style == "ringed":
            payload["ring_color"] = self.ring_color
        if self.style == "cratered":
            payload["crater_color"] = self.crater_color
        if self.style == "spiky":
            payload["mountain_color"] = self.mountain_color
        return payload
