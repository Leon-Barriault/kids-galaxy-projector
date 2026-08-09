"""Galaxy behavior domain model and deterministic seasonal scheduling.

This module owns the rules that decide how the projected galaxy looks and
moves. It is completely free of infrastructure concerns (no clock, no
filesystem, no HTTP). Seasonal theme resolution is pure and deterministic
so it can be unit-tested with fixed dates.
"""

from dataclasses import dataclass
from datetime import date, timedelta
from enum import StrEnum


class GalaxyTheme(StrEnum):
    """Visual theme applied to the entire galaxy scene."""

    DEFAULT = "default"
    HALLOWEEN = "halloween"
    EASTER = "easter"
    CHRISTMAS = "christmas"


class BehaviorMode(StrEnum):
    """How the active theme is chosen.

    AUTO  - theme is derived from the calendar (SeasonalThemeResolver).
    MANUAL - operator has locked a specific theme.
    """

    AUTO = "auto"
    MANUAL = "manual"


class ProjectorLanguage(StrEnum):
    """Language used by the projector's kid-facing on-screen text."""

    ENGLISH = "en"
    FRENCH = "fr"


@dataclass(frozen=True)
class GalaxyBehaviorSettings:
    """Persisted operator choices; AUTO resolves the theme from the calendar.

    Attributes:
        mode: Whether theme selection is automatic or manual.
        manual_theme: Theme used when mode is MANUAL.
        planet_speed: Multiplier for orbital / rotation speed (0.25 .. 2.0).
        ambient_effects: Whether subtle ambient visual effects are enabled.
        projector_language: Language used by the projector's on-screen copy.
    """

    mode: BehaviorMode = BehaviorMode.AUTO
    manual_theme: GalaxyTheme = GalaxyTheme.DEFAULT
    planet_speed: float = 1.0
    ambient_effects: bool = True
    projector_language: ProjectorLanguage = ProjectorLanguage.ENGLISH

    def __post_init__(self) -> None:
        if not 0.25 <= self.planet_speed <= 2.0:
            raise ValueError("planet_speed must be between 0.25 and 2.0")


@dataclass(frozen=True)
class GalaxyBehavior:
    """Effective projector behavior after schedule/manual resolution.

    This is the value that actually drives the Three.js scene. It is the
    result of applying GalaxyBehaviorSettings against the current date.
    """

    theme: GalaxyTheme
    planet_speed: float
    ambient_effects: bool
    mode: BehaviorMode
    projector_language: ProjectorLanguage = ProjectorLanguage.ENGLISH


class SeasonalThemeResolver:
    """Built-in annual scene presets with no infrastructure dependencies.

    The windows are intentionally a little generous so a classroom that only
    runs the projector a few times a week still hits the themed periods.
    """

    def resolve(self, day: date) -> GalaxyTheme:
        """Return the theme that should be active on the given calendar day."""
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
        """Gregorian Easter (Meeus/Jones/Butcher), valid for modern deployments.

        The algorithm is deterministic and has no external dependencies, which
        keeps the whole seasonal system unit-testable with plain date objects.
        """
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
        weekday_offset = (32 + 2 * e + 2 * i - h - k) % 7
        m = (a + 11 * h + 22 * weekday_offset) // 451
        month = (h + weekday_offset - 7 * m + 114) // 31
        day = ((h + weekday_offset - 7 * m + 114) % 31) + 1
        return date(year, month, day)

    def effective(
        self,
        settings: GalaxyBehaviorSettings,
        day: date,
    ) -> GalaxyBehavior:
        """Resolve the concrete behaviour that should be applied right now.

        Args:
            settings: Operator-persisted configuration.
            day: The calendar day to resolve against (normally today).

        Returns:
            A fully-resolved GalaxyBehavior ready for the projector.
        """
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
            projector_language=settings.projector_language,
        )
