"""Galaxy behavior domain model and deterministic seasonal scheduling."""

from dataclasses import dataclass
from datetime import date, timedelta
from enum import StrEnum


class GalaxyTheme(StrEnum):
    DEFAULT = "default"
    HALLOWEEN = "halloween"
    EASTER = "easter"
    CHRISTMAS = "christmas"


class BehaviorMode(StrEnum):
    AUTO = "auto"
    MANUAL = "manual"


@dataclass(frozen=True)
class GalaxyBehaviorSettings:
    """Persisted operator choices; AUTO resolves the theme from the calendar."""

    mode: BehaviorMode = BehaviorMode.AUTO
    manual_theme: GalaxyTheme = GalaxyTheme.DEFAULT
    planet_speed: float = 1.0
    ambient_effects: bool = True

    def __post_init__(self) -> None:
        if not 0.25 <= self.planet_speed <= 2.0:
            raise ValueError("planet_speed must be between 0.25 and 2.0")


@dataclass(frozen=True)
class GalaxyBehavior:
    """Effective projector behavior after schedule/manual resolution."""

    theme: GalaxyTheme
    planet_speed: float
    ambient_effects: bool
    mode: BehaviorMode


class SeasonalThemeResolver:
    """Built-in annual scene presets with no infrastructure dependencies."""

    def resolve(self, day: date) -> GalaxyTheme:
        # Christmas crosses the year boundary.
        if (day.month == 12 and day.day >= 20) or (day.month == 1 and day.day <= 6):
            return GalaxyTheme.CHRISTMAS

        if (day.month == 10 and day.day >= 25) or (day.month == 11 and day.day <= 1):
            return GalaxyTheme.HALLOWEEN

        easter = self.easter_sunday(day.year)
        if easter - timedelta(days=2) <= day <= easter + timedelta(days=1):
            return GalaxyTheme.EASTER

        return GalaxyTheme.DEFAULT

    @staticmethod
    def easter_sunday(year: int) -> date:
        """Gregorian Easter (Meeus/Jones/Butcher), valid for modern deployments."""
        a = year % 19
        b = year // 100
        c = year % 100
        d = b // 4
        e = b % 4
        f = (b + 8) // 25
        g = (b - f + 1) // 3
        h = (19 * a + b - d - g + 15) % 30
        i = c // 4
        k = c % 4
        l = (32 + 2 * e + 2 * i - h - k) % 7
        m = (a + 11 * h + 22 * l) // 451
        month = (h + l - 7 * m + 114) // 31
        day = ((h + l - 7 * m + 114) % 31) + 1
        return date(year, month, day)

    def effective(
        self,
        settings: GalaxyBehaviorSettings,
        day: date,
    ) -> GalaxyBehavior:
        theme = (
            self.resolve(day)
            if settings.mode == BehaviorMode.AUTO
            else settings.manual_theme
        )
        return GalaxyBehavior(
            theme=theme,
            planet_speed=settings.planet_speed,
            ambient_effects=settings.ambient_effects,
            mode=settings.mode,
        )
