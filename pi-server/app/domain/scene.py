"""
The Scene domain value.

A scene is an immutable snapshot of the planets currently visible in the
projector's sky. It deliberately contains no rendering, persistence or HTTP
concerns; those belong to the application and adapter layers.
"""

from dataclasses import dataclass

from app.domain.planet import Planet


@dataclass(frozen=True)
class Scene:
    """An immutable snapshot of the planets currently in the sky."""

    planets: tuple[Planet, ...]

    def __post_init__(self) -> None:
        # Copy any iterable supplied by a caller so the snapshot cannot be
        # changed by mutating the original collection after construction.
        object.__setattr__(self, "planets", tuple(self.planets))
