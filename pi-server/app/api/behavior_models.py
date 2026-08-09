"""HTTP request models for galaxy behavior management."""

from pydantic import BaseModel, Field

from app.domain.behavior import (
    DEFAULT_ENABLED_THEMES,
    BehaviorMode,
    EventFrequency,
    GalaxyBehaviorSettings,
    GalaxyTheme,
    ProjectorLanguage,
)


class BehaviorUpdateRequest(BaseModel):
    mode: BehaviorMode = BehaviorMode.AUTO
    manual_theme: GalaxyTheme = GalaxyTheme.DEFAULT
    planet_speed: float = Field(default=1.0, ge=0.25, le=2.0)
    ambient_effects: bool = True
    projector_language: ProjectorLanguage = ProjectorLanguage.ENGLISH
    asteroid_belt_enabled: bool = False
    comets_enabled: bool = False
    comet_frequency: EventFrequency = EventFrequency.NORMAL
    flyby_asteroids_enabled: bool = False
    flyby_frequency: EventFrequency = EventFrequency.NORMAL
    enabled_themes: list[GalaxyTheme] = Field(
        default_factory=lambda: list(DEFAULT_ENABLED_THEMES)
    )

    def to_domain(self) -> GalaxyBehaviorSettings:
        return GalaxyBehaviorSettings(
            mode=self.mode,
            manual_theme=self.manual_theme,
            planet_speed=self.planet_speed,
            ambient_effects=self.ambient_effects,
            projector_language=self.projector_language,
            asteroid_belt_enabled=self.asteroid_belt_enabled,
            comets_enabled=self.comets_enabled,
            comet_frequency=self.comet_frequency,
            flyby_asteroids_enabled=self.flyby_asteroids_enabled,
            flyby_frequency=self.flyby_frequency,
            enabled_themes=tuple(self.enabled_themes),
        )
