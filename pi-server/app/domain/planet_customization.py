"""Domain rules for kid-selected planet forms and animated companions."""

import re

from app.domain.errors import ValidationError

PLANET_STYLES = frozenset({"classic", "ringed", "cratered", "spiky"})
PLANET_COMPANIONS = frozenset({"moon", "stars", "satellite", "astronaut"})
DEFAULT_RING_COLOR = "#d8a6ff"
_HEX_COLOR = re.compile(r"^#[0-9a-fA-F]{6}$")


def normalize_planet_style(raw: str | None) -> str:
    value = (raw or "classic").strip().lower()
    if value not in PLANET_STYLES:
        raise ValidationError("Choose one of the available planet styles.")
    return value


def normalize_companions(raw: str | None) -> tuple[str, ...]:
    if not raw or not raw.strip():
        return ()

    requested = [item.strip().lower() for item in raw.split(",") if item.strip()]
    unknown = [item for item in requested if item not in PLANET_COMPANIONS]
    if unknown:
        raise ValidationError("Choose only the available space friends.")

    # Preserve the child's UI order while silently removing duplicates.
    return tuple(dict.fromkeys(requested))


def normalize_ring_color(raw: str | None) -> str:
    """Return a canonical CSS-style RGB hex value for the 3D ring."""
    value = (raw or DEFAULT_RING_COLOR).strip()
    if not _HEX_COLOR.fullmatch(value):
        raise ValidationError("Choose one of the available ring colors.")
    return value.lower()
