"""English and Canadian French catalogs for user-facing server messages.

The domain stores a stable message key. This module renders that key for the
locale negotiated from the caller's Accept-Language header. English remains
the fallback so existing clients keep the same sentences.
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

LOCALES = ("en", "fr")
_CATALOG_DIR = Path(__file__).resolve().parents[2] / "messages"


@lru_cache(maxsize=1)
def catalogs() -> dict[str, dict[str, str]]:
    loaded: dict[str, dict[str, str]] = {}
    for locale in LOCALES:
        path = _CATALOG_DIR / f"{locale}.json"
        loaded[locale] = json.loads(path.read_text(encoding="utf-8"))
    return loaded


def negotiate(accept_language: str | None) -> str:
    """Pick ``fr`` or ``en`` from an Accept-Language header.

    ``fr-CA`` and any other French tag select the French catalog. When the
    header is missing or names neither supported language, English is used.
    Quality values are honoured so ``en;q=0.1, fr;q=0.9`` selects French.
    """
    if not accept_language:
        return "en"

    ranked: list[tuple[float, int, str]] = []
    for index, part in enumerate(accept_language.split(",")):
        bits = [bit.strip() for bit in part.split(";") if bit.strip()]
        if not bits:
            continue
        tag = bits[0].lower().replace("_", "-")
        quality = 1.0
        for bit in bits[1:]:
            if bit.lower().startswith("q="):
                try:
                    quality = float(bit.split("=", 1)[1])
                except ValueError:
                    quality = 0.0
        primary = tag.split("-", 1)[0]
        if primary in {"en", "fr"}:
            ranked.append((quality, -index, primary))
        elif tag == "*":
            ranked.append((quality, -index, "en"))

    if not ranked:
        return "en"
    ranked.sort(reverse=True)
    return ranked[0][2]


def render(locale: str, key: str, **params: object) -> str:
    """Render one catalog entry, resolving ``*_key`` params inside the locale."""
    chosen = locale if locale in catalogs() else "en"
    catalog = catalogs()[chosen]
    english = catalogs()["en"]
    template = catalog.get(key) or english.get(key) or key
    values: dict[str, object] = {}
    for name, value in params.items():
        if name.endswith("_key"):
            lookup = str(value)
            values[name[: -len("_key")]] = catalog.get(lookup) or english.get(lookup) or lookup
        else:
            values[name] = value
    return template.format(**values)


def print_sheet_copy(
    locale: str,
    *,
    variant: str,
    style: str,
    planet_id: str,
    projection_width: int | None = None,
    projection_height: int | None = None,
) -> dict[str, str]:
    """Labels burned into a print sheet.

    ``variant`` is ``webgl`` (live projector frame), ``preview`` (server
    fallback), or ``mapped`` (the older projector-mapped sheet).
    """
    primary = (locale or "en").lower().replace("_", "-").split("-", 1)[0]
    chosen = primary if primary in LOCALES else "en"
    style_key = f"print_style_{style}"
    style_label = render(chosen, style_key) if style_key in catalogs()["en"] else style

    if variant == "webgl":
        heading_key = "print_heading_webgl"
        source_key = "print_provenance_webgl"
        footer_key = "print_footer_webgl"
    elif variant == "mapped":
        heading_key = "print_heading_mapped"
        source_key = "print_provenance_server"
        footer_key = "print_footer_server"
    else:
        heading_key = "print_heading_preview"
        source_key = "print_provenance_server"
        footer_key = "print_footer_server"

    if projection_width is not None and projection_height is not None:
        meta = render(
            chosen,
            "print_meta_projection",
            style=style_label,
            planet_id=planet_id,
            width=projection_width,
            height=projection_height,
        )
    else:
        meta = render(
            chosen,
            "print_meta",
            style=style_label,
            planet_id=planet_id,
            source=render(chosen, source_key),
        )
    return {
        "heading": render(chosen, heading_key),
        "kid_drawing": render(chosen, "print_kid_drawing"),
        "meta": meta,
        "footer": render(chosen, footer_key),
    }


def public_message(
    accept_language: str | None,
    *,
    message_key: str | None,
    message_params: dict[str, object] | None = None,
    fallback: str,
) -> str:
    """Return the sentence a client should see for one domain failure."""
    locale = negotiate(accept_language)
    if message_key is None or locale == "en":
        return fallback
    return render(locale, message_key, **(message_params or {}))
