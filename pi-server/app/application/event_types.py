"""Application event type alias.

Kept in a tiny module so ports can depend on a stable union without importing
transport code or using untyped dictionaries.

Any new event type must be added both here and in the concrete event classes
module so the type checker and runtime stay in sync.
"""

from app.application.events import (
    GalaxyBehaviorChanged,
    GalaxyCleared,
    PlanetCreated,
    PlanetRemoved,
)

type ApplicationEvent = (
    PlanetCreated | PlanetRemoved | GalaxyCleared | GalaxyBehaviorChanged
)
