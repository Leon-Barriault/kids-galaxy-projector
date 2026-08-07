"""
Naming rules.

Two different names, deliberately kept apart:

* **stored filename** - must be safe on any filesystem, so it is reduced to
  alphanumerics, spaces, underscores and hyphens. Dots and separators are
  dropped, which is what makes ".." traversal impossible by construction.
* **display name** - what the child typed. Shown on the projector, so it keeps
  apostrophes, accents and punctuation exactly as entered.

Conflating the two is what previously caused the projector to render the
internal id, e.g. "f31fc218ce My Planet".
"""

MAX_FILENAME_NAME_LENGTH = 80
MAX_DISPLAY_NAME_LENGTH = 120
DEFAULT_DISPLAY_NAME = "My Planet"
FILENAME_FALLBACK = "planet"

_ALLOWED_FILENAME_EXTRAS = "_- "


def sanitize_filename(name: str | None) -> str:
    """
    Reduce a user-supplied name to a filesystem-safe *fragment*.

    Only alphanumerics, spaces, underscores and hyphens survive. Because dots
    and slashes are removed, path traversal cannot get through this filter.

    The result is a name fragment, not a complete filename - the extension is
    appended by `build_stored_filename`. The fallback is therefore "planet"
    rather than "planet.png", which previously produced "planet.png.png".
    """
    if not name:
        return FILENAME_FALLBACK

    safe = "".join(
        c for c in name if c.isalnum() or c in _ALLOWED_FILENAME_EXTRAS
    ).strip()
    return (safe[:MAX_FILENAME_NAME_LENGTH] or FILENAME_FALLBACK).strip() or FILENAME_FALLBACK


def normalize_display_name(name: str | None) -> str:
    """Trim the child's name, falling back to a friendly default when blank."""
    cleaned = (name or "").strip()
    if not cleaned:
        return DEFAULT_DISPLAY_NAME
    return cleaned[:MAX_DISPLAY_NAME_LENGTH]


def build_stored_filename(planet_id: str, display_name: str) -> str:
    """Compose the on-disk name: '<id>_<safe name>.png'."""
    return f"{planet_id}_{sanitize_filename(display_name)}.png"
