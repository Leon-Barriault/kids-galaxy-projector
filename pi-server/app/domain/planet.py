"""
The Planet entity.

Immutable and framework-free. Owns the payload shape that both the REST
endpoint and the SSE stream emit, so the two can never drift apart.
"""

from dataclasses import dataclass
from pathlib import PurePosixPath

#: Response when no child has drawn anything yet.
NO_PLANET_PAYLOAD: dict = {"has_planet": False}


@dataclass(frozen=True)
class Planet:
    """A stored planet drawing."""

    id: str
    filename: str
    display_name: str
    created_at: float

    @property
    def url(self) -> str:
        """Public URL the projector loads the texture from."""
        return f"/uploads/{self.filename}"

    @property
    def metadata_filename(self) -> str:
        """Sidecar JSON that preserves the display name verbatim."""
        return PurePosixPath(self.filename).with_suffix(".json").name

    def to_payload(self) -> dict:
        """
        Wire format shared by GET /api/current-planet, GET /api/planets and the
        SSE stream. One shape means the projector needs one code path whether a
        planet arrives on page load or arrives live.

        `id` is present because the projector accumulates planets rather than
        replacing a single one, so it has to tell "already in orbit" from "just
        arrived". The id is already visible inside the URL, so publishing it
        exposes nothing new.

        `name` is the display name - never the filename - so the internal id
        does not reach the screen.
        """
        return {
            "has_planet": True,
            "id": self.id,
            "url": self.url,
            "name": self.display_name,
            "timestamp": self.created_at,
        }
