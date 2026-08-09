"""HTTP request models for galaxy behavior management."""

from pydantic import BaseModel, Field

from app.domain.behavior import (
    BehaviorMode,
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

    def to_domain(self) -> GalaxyBehaviorSettings:
        return GalaxyBehaviorSettings(
            mode=self.mode,
            manual_theme=self.manual_theme,
            planet_speed=self.planet_speed,
            ambient_effects=self.ambient_effects,
            projector_language=self.projector_language,
        )
