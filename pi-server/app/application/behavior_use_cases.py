"""Application orchestration for galaxy behavior and seasonal scenes.

These use cases sit between the HTTP / manager layer and the domain rules
that decide which seasonal theme is active. They are deliberately thin:
load or save settings, resolve the effective behaviour for "today", and
publish a change event when the operator updates the configuration.
"""

from dataclasses import dataclass

from app.application.events import GalaxyBehaviorChanged
from app.domain.behavior import (
    GalaxyBehavior,
    GalaxyBehaviorSettings,
    SeasonalThemeResolver,
)
from app.ports import BehaviorRepository, Clock, EventPublisher


@dataclass(frozen=True)
class GalaxyBehaviorState:
    """Snapshot returned to callers that need both the stored settings and the
    currently effective behaviour (after seasonal resolution).

    Attributes:
        settings: The operator-persisted configuration (mode, manual theme,
            speed, ambient effects).
        effective: The behaviour that should actually be applied right now
            (theme may have been resolved from the calendar).
    """

    settings: GalaxyBehaviorSettings
    effective: GalaxyBehavior


class GetGalaxyBehaviorUseCase:
    """Return the current behaviour settings and the resolved effective state."""

    def __init__(
        self,
        repository: BehaviorRepository,
        clock: Clock,
        resolver: SeasonalThemeResolver,
    ):
        self._repository = repository
        self._clock = clock
        self._resolver = resolver

    def execute(self) -> GalaxyBehaviorState:
        """Load settings and resolve the theme that should be active today."""
        settings = self._repository.load()
        effective = self._resolver.effective(settings, self._clock.today())
        return GalaxyBehaviorState(settings=settings, effective=effective)


class UpdateGalaxyBehaviorUseCase:
    """Persist new behaviour settings and notify listeners of the change."""

    def __init__(
        self,
        repository: BehaviorRepository,
        publisher: EventPublisher,
        clock: Clock,
        resolver: SeasonalThemeResolver,
    ):
        self._repository = repository
        self._publisher = publisher
        self._clock = clock
        self._resolver = resolver

    def execute(self, settings: GalaxyBehaviorSettings) -> GalaxyBehaviorState:
        """Save the new settings, recompute the effective behaviour, and publish.

        Args:
            settings: The complete new configuration chosen by the operator.

        Returns:
            The resulting GalaxyBehaviorState after persistence and resolution.
        """
        self._repository.save(settings)
        effective = self._resolver.effective(settings, self._clock.today())
        self._publisher.publish(GalaxyBehaviorChanged(effective))
        return GalaxyBehaviorState(settings=settings, effective=effective)
