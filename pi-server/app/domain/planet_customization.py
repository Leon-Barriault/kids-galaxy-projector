"""Domain rules for kid-selected planet forms and animated companions.

These pure functions validate and normalise the optional design choices a
child can make when sending a planet (style, companions and feature colours).
They raise ValidationError on illegal values so the use-case layer can treat
them like any other domain rule violation.
"""

import re

from app.domain.errors import ValidationError

#: Allowed visual styles the projector knows how to render.
PLANET_STYLES = frozenset({"classic", "ringed", "cratered", "spiky"})

#: Allowed companion identifiers that can float around a planet.
PLANET_COMPANIONS = frozenset({"moon", "stars", "satellite", "astronaut"})

#: Default feature colours used when older clients do not send a value.
DEFAULT_RING_COLOR = "#d8a6ff"
DEFAULT_CRATER_COLOR = "#858c98"
DEFAULT_MOUNTAIN_COLOR = "#8d6e63"

_HEX_COLOR = re.compile(r"^#[0-9a-fA-F]{6}$")


def normalize_planet_style(raw: str | None) -> str:
    """Return a canonical planet style or raise ValidationError.

    Blank / None defaults to "classic". Values are lower-cased and must be
    one of the members of PLANET_STYLES.
    """
    value = (raw or "classic").strip().lower()
    if value not in PLANET_STYLES:
        raise ValidationError("Choose one of the available planet styles.")
    return value


def normalize_companions(raw: str | None) -> tuple[str, ...]:
    """Parse a comma-separated companion list into a stable ordered tuple.

    - Empty / None input yields an empty tuple.
    - Unknown companions raise ValidationError.
    - Duplicates are removed while preserving the child's original order.
    """
    if not raw or not raw.strip():
        return ()

    requested = [item.strip().lower() for item in raw.split(",") if item.strip()]
    unknown = [item for item in requested if item not in PLANET_COMPANIONS]
    if unknown:
        raise ValidationError("Choose only the available space friends.")

    return tuple(dict.fromkeys(requested))


def _normalize_feature_color(
    raw: str | None,
    default: str,
    feature_name: str,
) -> str:
    value = (raw or default).strip()
    if not _HEX_COLOR.fullmatch(value):
        raise ValidationError(f"Choose one of the available {feature_name} colors.")
    return value.lower()


def normalize_body_color(raw: str | None) -> str | None:
    """Return the tablet-selected planet body colour when explicitly supplied.

    Older tablets did not send this field, so blank / None deliberately stays
    ``None`` and lets the projector's legacy artwork inference remain available.
    New tablets always send the bucket/background colour, including ``#ffffff``.
    """
    if raw is None or not raw.strip():
        return None
    value = raw.strip()
    if not _HEX_COLOR.fullmatch(value):
        raise ValidationError("Choose one of the available planet background colors.")
    return value.lower()


def normalize_ring_color(raw: str | None) -> str:
    """Return a canonical CSS-style RGB hex value for the 3D ring."""
    return _normalize_feature_color(raw, DEFAULT_RING_COLOR, "ring")


def normalize_crater_color(raw: str | None) -> str:
    """Return a canonical CSS-style RGB hex value for crater interiors."""
    return _normalize_feature_color(raw, DEFAULT_CRATER_COLOR, "crater")


def normalize_mountain_color(raw: str | None) -> str:
    """Return a canonical CSS-style RGB hex value for mountain peaks."""
    return _normalize_feature_color(raw, DEFAULT_MOUNTAIN_COLOR, "mountain")
