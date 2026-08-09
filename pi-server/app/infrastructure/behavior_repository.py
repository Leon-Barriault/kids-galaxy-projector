"""Filesystem persistence for operator-selected galaxy behavior."""

import json
from pathlib import Path

from app.domain.behavior import (
    BehaviorMode,
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
            )
        except (OSError, ValueError, TypeError, json.JSONDecodeError):
            # A power loss during a hand-edited file or old incompatible state
            # must not prevent the projector from starting.
            return GalaxyBehaviorSettings()

    def save(self, settings: GalaxyBehaviorSettings) -> None:
        payload = {
            "mode": settings.mode.value,
            "manual_theme": settings.manual_theme.value,
            "planet_speed": settings.planet_speed,
            "ambient_effects": settings.ambient_effects,
            "projector_language": settings.projector_language.value,
        }
        temporary = self._path.with_suffix(".tmp")
        temporary.write_text(
            json.dumps(payload, separators=(",", ":")),
            encoding="utf-8",
        )
        temporary.replace(self._path)
