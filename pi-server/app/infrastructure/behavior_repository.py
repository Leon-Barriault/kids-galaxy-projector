"""Filesystem persistence for operator-selected galaxy behavior."""

import json
from pathlib import Path

from app.domain.behavior import (
    DEFAULT_ENABLED_THEMES,
    BehaviorMode,
    EventFrequency,
    GalaxyBehaviorSettings,
    GalaxyTheme,
    ProjectorLanguage,
)
from app.ports import BehaviorRepository


class JsonBehaviorRepository(BehaviorRepository):
    def __init__(self, state_dir: Path):
        self._state_dir = state_dir
        self._path = state_dir / "galaxy_behavior.json"
        self._state_dir.mkdir(parents=True, exist_ok=True)

    def load(self) -> GalaxyBehaviorSettings:
        if not self._path.exists():
            return GalaxyBehaviorSettings()
        try:
            raw = json.loads(self._path.read_text(encoding="utf-8"))
            if not isinstance(raw, dict):
                # Valid JSON of the wrong shape - `null` from a truncated
                # write, `[]` from a hand edit - parses cleanly and then dies
                # on `.get` with an AttributeError the clause below never saw.
                return GalaxyBehaviorSettings()
            raw_themes = raw.get(
                "enabled_themes",
                [theme.value for theme in DEFAULT_ENABLED_THEMES],
            )
            return GalaxyBehaviorSettings(
                mode=BehaviorMode(raw.get("mode", BehaviorMode.AUTO.value)),
                manual_theme=GalaxyTheme(
                    raw.get("manual_theme", GalaxyTheme.DEFAULT.value)
                ),
                planet_speed=float(raw.get("planet_speed", 1.0)),
                ambient_effects=bool(raw.get("ambient_effects", True)),
                projector_language=ProjectorLanguage(
                    raw.get("projector_language", ProjectorLanguage.ENGLISH.value)
                ),
                asteroid_belt_enabled=bool(raw.get("asteroid_belt_enabled", False)),
                comets_enabled=bool(raw.get("comets_enabled", False)),
                comet_frequency=EventFrequency(
                    raw.get("comet_frequency", EventFrequency.NORMAL.value)
                ),
                flyby_asteroids_enabled=bool(
                    raw.get("flyby_asteroids_enabled", False)
                ),
                flyby_frequency=EventFrequency(
                    raw.get("flyby_frequency", EventFrequency.NORMAL.value)
                ),
                enabled_themes=tuple(GalaxyTheme(value) for value in raw_themes),
            )
        except (OSError, ValueError, TypeError, AttributeError, json.JSONDecodeError):
            # A power loss during a hand-edited file or old incompatible state
            # must not prevent the projector from starting. This file is read on
            # every /api/behavior call, so anything that escapes here is not a
            # one-off failure - it is a 500 that repeats until someone finds and
            # deletes the file on the box.
            return GalaxyBehaviorSettings()

    def save(self, settings: GalaxyBehaviorSettings) -> None:
        payload = {
            "mode": settings.mode.value,
            "manual_theme": settings.manual_theme.value,
            "planet_speed": settings.planet_speed,
            "ambient_effects": settings.ambient_effects,
            "projector_language": settings.projector_language.value,
            "asteroid_belt_enabled": settings.asteroid_belt_enabled,
            "comets_enabled": settings.comets_enabled,
            "comet_frequency": settings.comet_frequency.value,
            "flyby_asteroids_enabled": settings.flyby_asteroids_enabled,
            "flyby_frequency": settings.flyby_frequency.value,
            "enabled_themes": [theme.value for theme in settings.enabled_themes],
        }
        temporary = self._path.with_suffix(".tmp")
        temporary.write_text(
            json.dumps(payload, separators=(",", ":")),
            encoding="utf-8",
        )
        temporary.replace(self._path)
