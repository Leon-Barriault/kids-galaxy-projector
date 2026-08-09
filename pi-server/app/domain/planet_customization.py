"""Domain rules for kid-selected planet forms and animated companions.

These pure functions validate and normalise the optional design choices a
child can make when sending a planet (style, companions, ring colour). They
raise ValidationError on illegal values so the use-case layer can treat them
like any other domain rule violation.
"""

import re

from app.domain.errors import ValidationError

#: Allowed visual styles the projector knows how to render.
PLANET_STYLES = frozenset({"classic", "ringed", "cratered", "spiky"})

#: Allowed companion identifiers that can float around a planet.
PLANET_COMPANIONS = frozenset({"moon", "stars", "satellite", "astronaut"})

#: Default ring colour used when the child does not pick one.
DEFAULT_RING_COLOR = "#d8a6ff"

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

    # Preserve the child's UI order while silently removing duplicates.
    return tuple(dict.fromkeys(requested))


def normalize_ring_color(raw: str | None) -> str:
    """Return a canonical CSS-style RGB hex value for the 3D ring.

    Accepts only #RRGGBB (case-insensitive). Falls back to DEFAULT_RING_COLOR
    when the input is blank. Raises ValidationError for any other format.
    """
    value = (raw or DEFAULT_RING_COLOR).strip()
    if not _HEX_COLOR.fullmatch(value):
        raise ValidationError("Choose one of the available ring colors.")
    return value.lower()
