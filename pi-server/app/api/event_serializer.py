"""Serialize typed application events into stable projector wire contracts."""

from app.api.behavior_mapper import behavior_to_payload
from app.application.event_types import ApplicationEvent
from app.application.events import (
    GalaxyBehaviorChanged,
    GalaxyCleared,
    PlanetCreated,
    PlanetRemoved,
)


def serialize_application_event(event: ApplicationEvent) -> tuple[str, dict]:
    """Return the SSE event name and JSON payload for an application event."""
    if isinstance(event, PlanetCreated):
        return "planet", event.planet.to_payload()
    if isinstance(event, PlanetRemoved):
        return "planet", {
            "has_planet": False,
            "id": event.planet_id,
            "removed": True,
        }
    if isinstance(event, GalaxyCleared):
        return "planet", {"has_planet": False, "cleared": True}
    if isinstance(event, GalaxyBehaviorChanged):
        return "behavior", behavior_to_payload(event.behavior)
    raise TypeError(f"Unsupported application event: {type(event).__name__}")
