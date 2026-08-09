"""
The Planet entity.

Immutable and framework-free. Owns the payload shape that both the REST
endpoint and the SSE stream emit, so the two can never drift apart.
"""

from dataclasses import dataclass
from pathlib import PurePosixPath

from app.domain.planet_customization import DEFAULT_RING_COLOR

#: Response when no child has drawn anything yet.
NO_PLANET_PAYLOAD: dict = {"has_planet": False}


@dataclass(frozen=True)
class Planet:
    """A stored planet drawing plus the child's presentation choices."""

    id: str
    filename: str
    display_name: str
    created_at: float
    style: str = "classic"
    companions: tuple[str, ...] = ()
    ring_color: str = DEFAULT_RING_COLOR

    @property
    def url(self) -> str:
        """Public URL the projector loads the texture from."""
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
        return payload
