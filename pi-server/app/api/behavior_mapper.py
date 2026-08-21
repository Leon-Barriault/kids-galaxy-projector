"""Transport mapping for effective galaxy behavior."""

from app.domain.behavior import GalaxyBehavior, GalaxyBehaviorSettings


def behavior_to_payload(behavior: GalaxyBehavior) -> dict:
    return {
        "theme": behavior.theme.value,
        "planet_speed": behavior.planet_speed,
        "ambient_effects": behavior.ambient_effects,
        "mode": behavior.mode.value,
        "projector_language": behavior.projector_language.value,
        "asteroid_belt_enabled": behavior.asteroid_belt_enabled,
        "comets_enabled": behavior.comets_enabled,
        "comet_frequency": behavior.comet_frequency.value,
        "flyby_asteroids_enabled": behavior.flyby_asteroids_enabled,
        "flyby_frequency": behavior.flyby_frequency.value,
    }


def behavior_settings_to_payload(settings: GalaxyBehaviorSettings) -> dict:
    return {
        "mode": settings.mode.value,
        "manual_theme": settings.manual_theme.value,
        "region": settings.region.value,
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
