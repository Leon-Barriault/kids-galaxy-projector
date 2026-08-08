"""Application orchestration for galaxy behavior and seasonal scenes."""

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
    settings: GalaxyBehaviorSettings
    effective: GalaxyBehavior


class GetGalaxyBehaviorUseCase:
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
        settings = self._repository.load()
        effective = self._resolver.effective(settings, self._clock.today())
        return GalaxyBehaviorState(settings=settings, effective=effective)


class UpdateGalaxyBehaviorUseCase:
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
        self._repository.save(settings)
        effective = self._resolver.effective(settings, self._clock.today())
        self._publisher.publish(GalaxyBehaviorChanged(effective))
        return GalaxyBehaviorState(settings=settings, effective=effective)
