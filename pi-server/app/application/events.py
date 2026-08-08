"""Typed application events emitted after successful state changes.

The application layer speaks in events, not transport dictionaries. Adapters
such as SSE decide how those events are serialized for clients.
"""

from dataclasses import dataclass

from app.domain.planet import Planet


@dataclass(frozen=True)
class PlanetCreated:
    planet: Planet


@dataclass(frozen=True)
class PlanetRemoved:
    planet_id: str


@dataclass(frozen=True)
class GalaxyCleared:
    """All planets were removed from the current galaxy scene."""
