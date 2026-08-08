"""
Configuration.

All environment reading happens here, once, so the rest of the code takes
explicit values instead of consulting os.environ at import time.
"""

import os
from dataclasses import dataclass
from pathlib import Path

DEFAULT_MAX_FILE_SIZE = 5 * 1024 * 1024
DEFAULT_MAX_DIMENSION = 2048
DEFAULT_TEXTURE_SIZE = 1024
DEFAULT_RATE_LIMIT_SECONDS = 3.0
DEFAULT_MAX_STORED_PLANETS = 30
DEFAULT_GALLERY_SIZE = 12

DEFAULT_SURFACE_STYLE = "terrain"
SURFACE_STYLES = ("terrain", "blend", "off")
DEFAULT_GALAXY_NAME = "Kids Galaxy"
DEFAULT_ADVERTISE = True
DEFAULT_ADVERTISE_SCHEME = "http"
ADVERTISE_SCHEMES = ("http", "https")
DEFAULT_AUTHORIZATION_ENABLED = False
DEFAULT_TRUSTED_ROLE_PROXY_HOSTS = ("127.0.0.1", "::1")


@dataclass(frozen=True)
class Settings:
    upload_dir: Path = Path("uploads")
    state_dir: Path = Path("state")
    static_dir: Path = Path("static")
    max_file_size: int = DEFAULT_MAX_FILE_SIZE
    max_dimension: int = DEFAULT_MAX_DIMENSION
    texture_size: int = DEFAULT_TEXTURE_SIZE
    rate_limit_seconds: float = DEFAULT_RATE_LIMIT_SECONDS
    max_stored_planets: int = DEFAULT_MAX_STORED_PLANETS
    gallery_size: int = DEFAULT_GALLERY_SIZE
    surface_style: str = DEFAULT_SURFACE_STYLE
    galaxy_name: str = DEFAULT_GALAXY_NAME
    advertise: bool = DEFAULT_ADVERTISE
    advertise_scheme: str = DEFAULT_ADVERTISE_SCHEME
    authorization_enabled: bool = DEFAULT_AUTHORIZATION_ENABLED
    trusted_role_proxy_hosts: tuple[str, ...] = DEFAULT_TRUSTED_ROLE_PROXY_HOSTS
    port: int = 8000
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

        def _flag(key: str, *, default: bool) -> bool:
            raw = (source.get(key) or "").strip().lower()
            if not raw:
                return default
            return raw not in {"0", "false", "no", "off"}

        def _choice(key: str, allowed: tuple[str, ...], default: str) -> str:
            raw = (source.get(key) or "").strip().lower()
            return raw if raw in allowed else default

        def _csv(key: str, default: tuple[str, ...]) -> tuple[str, ...]:
            raw = source.get(key)
            if raw is None or not raw.strip():
                return default
            values = tuple(value.strip() for value in raw.split(",") if value.strip())
            return values or default

        origins_raw = (source.get("ALLOWED_ORIGINS") or "*").strip()
        origins = (
            ("*",)
            if origins_raw == "*"
            else tuple(o.strip() for o in origins_raw.split(",") if o.strip())
        )

        return cls(
            upload_dir=Path(source.get("UPLOAD_DIR") or "uploads"),
            state_dir=Path(source.get("STATE_DIR") or "state"),
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
            galaxy_name=(source.get("GALAXY_NAME") or DEFAULT_GALAXY_NAME).strip()
            or DEFAULT_GALAXY_NAME,
            advertise=_flag("ADVERTISE", default=DEFAULT_ADVERTISE),
            advertise_scheme=_choice(
                "ADVERTISE_SCHEME",
                ADVERTISE_SCHEMES,
                DEFAULT_ADVERTISE_SCHEME,
            ),
            authorization_enabled=_flag(
                "AUTHORIZATION_ENABLED",
                default=DEFAULT_AUTHORIZATION_ENABLED,
            ),
            trusted_role_proxy_hosts=_csv(
                "TRUSTED_ROLE_PROXY_HOSTS",
                DEFAULT_TRUSTED_ROLE_PROXY_HOSTS,
            ),
            port=_int("PORT", 8000),
            allowed_origins=origins,
            environment=source.get("ENVIRONMENT") or "production",
        )
