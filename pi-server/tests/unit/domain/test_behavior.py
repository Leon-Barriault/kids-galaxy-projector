from datetime import date

import pytest

from app.domain.behavior import (
    BehaviorMode,
    GalaxyBehaviorSettings,
    GalaxyTheme,
    ProjectorLanguage,
    SeasonalThemeResolver,
)


@pytest.fixture
def resolver() -> SeasonalThemeResolver:
    return SeasonalThemeResolver()


def test_halloween_window_is_automatic(resolver):
    assert resolver.resolve(date(2026, 10, 25)) == GalaxyTheme.HALLOWEEN
    assert resolver.resolve(date(2026, 10, 31)) == GalaxyTheme.HALLOWEEN
    assert resolver.resolve(date(2026, 11, 1)) == GalaxyTheme.HALLOWEEN
    assert resolver.resolve(date(2026, 11, 2)) == GalaxyTheme.DEFAULT


def test_christmas_window_crosses_new_year(resolver):
    assert resolver.resolve(date(2026, 12, 20)) == GalaxyTheme.CHRISTMAS
    assert resolver.resolve(date(2027, 1, 6)) == GalaxyTheme.CHRISTMAS
    assert resolver.resolve(date(2027, 1, 7)) == GalaxyTheme.DEFAULT


def test_easter_uses_the_real_gregorian_date(resolver):
    # Easter Sunday is April 5 in 2026 and March 28 in 2027.
    assert resolver.easter_sunday(2026) == date(2026, 4, 5)
    assert resolver.easter_sunday(2027) == date(2027, 3, 28)
    assert resolver.resolve(date(2026, 4, 3)) == GalaxyTheme.EASTER
    assert resolver.resolve(date(2026, 4, 6)) == GalaxyTheme.EASTER


def test_manual_mode_overrides_the_calendar(resolver):
    settings = GalaxyBehaviorSettings(
        mode=BehaviorMode.MANUAL,
        manual_theme=GalaxyTheme.HALLOWEEN,
        planet_speed=1.4,
        ambient_effects=False,
    )

    behavior = resolver.effective(settings, date(2026, 12, 25))

    assert behavior.theme == GalaxyTheme.HALLOWEEN
    assert behavior.mode == BehaviorMode.MANUAL
    assert behavior.planet_speed == 1.4
    assert behavior.ambient_effects is False


def test_auto_mode_keeps_operator_motion_and_language_settings(resolver):
    settings = GalaxyBehaviorSettings(
        planet_speed=0.75,
        ambient_effects=False,
        projector_language=ProjectorLanguage.FRENCH,
    )

    behavior = resolver.effective(settings, date(2026, 12, 25))

    assert behavior.theme == GalaxyTheme.CHRISTMAS
    assert behavior.planet_speed == 0.75
    assert behavior.ambient_effects is False
    assert behavior.projector_language == ProjectorLanguage.FRENCH


@pytest.mark.parametrize("speed", [0.24, 2.01, -1.0, 5.0])
def test_planet_speed_outside_safe_range_is_rejected(speed):
    with pytest.raises(ValueError):
        GalaxyBehaviorSettings(planet_speed=speed)
