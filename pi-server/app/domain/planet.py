"""
The Planet entity.

Immutable and framework-free. Owns the payload shape that both the REST
endpoint and the SSE stream emit, so the two can never drift apart.
"""

from dataclasses import dataclass
from pathlib import PurePosixPath

from app.domain.planet_customization import (
    DEFAULT_CRATER_COLOR,
    DEFAULT_MOUNTAIN_COLOR,
    DEFAULT_RING_COLOR,
)

NO_PLANET_PAYLOAD: dict = {"has_planet": False}


@dataclass(frozen=True)
class Planet:
    id: str
    filename: str
    display_name: str
    created_at: float
    style: str = "classic"
    companions: tuple[str, ...] = ()
    ring_color: str = DEFAULT_RING_COLOR
    crater_color: str = DEFAULT_CRATER_COLOR
    mountain_color: str = DEFAULT_MOUNTAIN_COLOR
    body_color: str | None = None

    @property
    def url(self) -> str:
        return f"/uploads/{self.filename}"

    @property
    def metadata_filename(self) -> str:
        return PurePosixPath(self.filename).with_suffix(".json").name

    def to_payload(self) -> dict:
        payload = {
            "has_planet": True,
            "id": self.id,
            "url": self.url,
            "name": self.display_name,
            "timestamp": self.created_at,
            "style": self.style,
            "companions": list(self.companions),
        }
        if self.body_color is not None:
            payload["body_color"] = self.body_color
        if self.style == "ringed":
            payload["ring_color"] = self.ring_color
        if self.style == "cratered":
            payload["crater_color"] = self.crater_color
        if self.style == "spiky":
            payload["mountain_color"] = self.mountain_color
        return payload
