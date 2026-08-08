from datetime import date

from app.application.behavior_use_cases import (
    GetGalaxyBehaviorUseCase,
    UpdateGalaxyBehaviorUseCase,
)
from app.application.events import GalaxyBehaviorChanged
from app.domain.behavior import (
    BehaviorMode,
    GalaxyBehaviorSettings,
    GalaxyTheme,
    SeasonalThemeResolver,
)


class FakeBehaviorRepository:
    def __init__(self, settings: GalaxyBehaviorSettings | None = None):
        self.settings = settings or GalaxyBehaviorSettings()
        self.saved = []

    def load(self):
        return self.settings

    def save(self, settings):
        self.settings = settings
        self.saved.append(settings)


class FixedClock:
    def __init__(self, day: date):
        self.day = day

    def today(self):
        return self.day


class FakePublisher:
    def __init__(self):
        self.published = []

    def publish(self, event):
        self.published.append(event)


def test_get_behavior_resolves_auto_schedule_without_mutating_settings():
    repository = FakeBehaviorRepository()
    use_case = GetGalaxyBehaviorUseCase(
        repository,
        FixedClock(date(2026, 10, 31)),
        SeasonalThemeResolver(),
    )

    state = use_case.execute()

    assert state.settings.mode == BehaviorMode.AUTO
    assert state.effective.theme == GalaxyTheme.HALLOWEEN
    assert repository.saved == []


def test_update_persists_settings_and_publishes_effective_behavior():
    repository = FakeBehaviorRepository()
    publisher = FakePublisher()
    use_case = UpdateGalaxyBehaviorUseCase(
        repository,
        publisher,
        FixedClock(date(2026, 12, 25)),
        SeasonalThemeResolver(),
    )
    settings = GalaxyBehaviorSettings(
        mode=BehaviorMode.MANUAL,
        manual_theme=GalaxyTheme.EASTER,
        planet_speed=1.25,
        ambient_effects=False,
    )

    state = use_case.execute(settings)

    assert repository.saved == [settings]
    assert state.effective.theme == GalaxyTheme.EASTER
    assert publisher.published == [GalaxyBehaviorChanged(state.effective)]


def test_auto_update_publishes_the_season_that_is_active_now():
    repository = FakeBehaviorRepository()
    publisher = FakePublisher()
    use_case = UpdateGalaxyBehaviorUseCase(
        repository,
        publisher,
        FixedClock(date(2026, 12, 24)),
        SeasonalThemeResolver(),
    )

    state = use_case.execute(GalaxyBehaviorSettings(mode=BehaviorMode.AUTO))

    assert state.effective.theme == GalaxyTheme.CHRISTMAS
    assert publisher.published[0].behavior.theme == GalaxyTheme.CHRISTMAS
