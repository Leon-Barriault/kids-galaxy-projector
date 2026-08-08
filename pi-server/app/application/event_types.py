"""Application event type alias.

Kept in a tiny module so ports can depend on a stable union without importing
transport code or using untyped dictionaries.
"""

from app.application.events import GalaxyCleared, PlanetCreated, PlanetRemoved

type ApplicationEvent = PlanetCreated | PlanetRemoved | GalaxyCleared
