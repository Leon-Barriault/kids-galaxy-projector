"""Typed application events emitted after successful state changes.

The application layer speaks in events, not transport dictionaries. Adapters
such as SSE decide how those events are serialized for clients.

Keeping events as simple frozen dataclasses makes them easy to pattern-match
on the consumer side and keeps the application free of any knowledge of
HTTP, JSON, or Server-Sent Events framing.
"""

from dataclasses import dataclass

from app.domain.behavior import GalaxyBehavior
from app.domain.planet import Planet


@dataclass(frozen=True)
class PlanetCreated:
    """A new planet was successfully stored and should appear in the sky.

    Attributes:
        planet: The full Planet entity that was just persisted.
    """

    planet: Planet


@dataclass(frozen=True)
class PlanetRemoved:
    """A single planet was deleted and should be removed from the sky.

    Attributes:
        planet_id: The short id of the planet that was removed.
    """

    planet_id: str


@dataclass(frozen=True)
class GalaxyCleared:
    """All planets were removed from the current galaxy scene.

    Emitted by ClearPlanetsUseCase so the projector can empty the sky in a
    single frame instead of processing a cascade of individual removals.
    """


@dataclass(frozen=True)
class GalaxyBehaviorChanged:
    """Operator changed the galaxy behaviour settings (theme, speed, etc.).

    Attributes:
        behavior: The newly effective behaviour after resolution.
    """

    behavior: GalaxyBehavior
