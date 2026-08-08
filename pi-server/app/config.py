"""
Configuration.

All environment reading happens here, once, so the rest of the code takes
explicit values instead of consulting os.environ at import time (which made the
old module impossible to reconfigure under test).
"""

import os
from dataclasses import dataclass
from pathlib import Path

DEFAULT_MAX_FILE_SIZE = 5 * 1024 * 1024
DEFAULT_MAX_DIMENSION = 2048
DEFAULT_TEXTURE_SIZE = 1024
DEFAULT_RATE_LIMIT_SECONDS = 3.0
DEFAULT_MAX_STORED_PLANETS = 30

#: How many planets orbit on the projector at once. Distinct from
#: MAX_STORED_PLANETS, which is about disk: the store deliberately keeps
#: more than the sky shows, so raising this needs no re-upload.
DEFAULT_GALLERY_SIZE = 12

#: How an uploaded drawing is turned into a planet surface.
#:   "blend"   - the colours are diffused across the sphere (the default)
#:   "terrain" - the palette becomes water, forest, lava, gas and so on
#:   "off"     - the drawing is stored exactly as it arrived
#:
#: The default is "blend" because the owner tried both and preferred it:
#: terrain reads as generated, blend reads as the child's own drawing on a
#: world. That is a judgement about a room full of children looking at a
#: wall, not something the code can decide, so do not "fix" it back.
DEFAULT_SURFACE_STYLE = "blend"
SURFACE_STYLES = ("terrain", "blend", "off")


@dataclass(frozen=True)
class Settings:
    upload_dir: Path = Path("uploads")
    static_dir: Path = Path("static")
    max_file_size: int = DEFAULT_MAX_FILE_SIZE
    max_dimension: int = DEFAULT_MAX_DIMENSION
    texture_size: int = DEFAULT_TEXTURE_SIZE
    rate_limit_seconds: float = DEFAULT_RATE_LIMIT_SECONDS
    max_stored_planets: int = DEFAULT_MAX_STORED_PLANETS
    gallery_size: int = DEFAULT_GALLERY_SIZE
    surface_style: str = DEFAULT_SURFACE_STYLE
    allowed_origins: tuple[str, ...] = ("*",)
    environment: str = "production"

    @property
    def is_development(self) -> bool:
        return self.environment.lower() in {"development", "dev", "local"}

    @classmethod
    def from_env(cls, env: dict[str, str] | None = None) -> "Settings":
        source = os.environ if env is None else env

        def _int(key: str, default: int) -> int:
            raw = source.get(key)
            if raw is None or not raw.strip():
                return default
            try:
                return int(raw)
            except ValueError:
                return default

        def _choice(key: str, allowed: tuple[str, ...], default: str) -> str:
            raw = (source.get(key) or "").strip().lower()
            # An unrecognised value falls back rather than raising: a typo in a
            # systemd unit should not stop the projector serving planets.
            return raw if raw in allowed else default

        origins_raw = (source.get("ALLOWED_ORIGINS") or "*").strip()
        origins = (
            ("*",)
            if origins_raw == "*"
            else tuple(o.strip() for o in origins_raw.split(",") if o.strip())
        )

        return cls(
            upload_dir=Path(source.get("UPLOAD_DIR") or "uploads"),
            static_dir=Path(source.get("STATIC_DIR") or "static"),
            max_file_size=_int("MAX_FILE_SIZE", DEFAULT_MAX_FILE_SIZE),
            max_dimension=_int("MAX_DIMENSION", DEFAULT_MAX_DIMENSION),
            texture_size=_int("TEXTURE_SIZE", DEFAULT_TEXTURE_SIZE),
            rate_limit_seconds=float(
                _int("RATE_LIMIT_SECONDS", int(DEFAULT_RATE_LIMIT_SECONDS))
            ),
            max_stored_planets=_int("MAX_STORED_PLANETS", DEFAULT_MAX_STORED_PLANETS),
            gallery_size=_int("GALLERY_SIZE", DEFAULT_GALLERY_SIZE),
            surface_style=_choice("SURFACE_STYLE", SURFACE_STYLES, DEFAULT_SURFACE_STYLE),
            allowed_origins=origins,
            environment=source.get("ENVIRONMENT") or "production",
        )
