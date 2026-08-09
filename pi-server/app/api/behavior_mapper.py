"""Transport mapping for effective galaxy behavior."""

from app.domain.behavior import GalaxyBehavior, GalaxyBehaviorSettings


def behavior_to_payload(behavior: GalaxyBehavior) -> dict:
    return {
        "theme": behavior.theme.value,
        "planet_speed": behavior.planet_speed,
        "ambient_effects": behavior.ambient_effects,
        "mode": behavior.mode.value,
        "projector_language": behavior.projector_language.value,
    }


def behavior_settings_to_payload(settings: GalaxyBehaviorSettings) -> dict:
    return {
        "mode": settings.mode.value,
        "manual_theme": settings.manual_theme.value,
        "planet_speed": settings.planet_speed,
        "ambient_effects": settings.ambient_effects,
        "projector_language": settings.projector_language.value,
    }
