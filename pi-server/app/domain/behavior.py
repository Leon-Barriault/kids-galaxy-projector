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
    REMEMBRANCE_DAY = "remembrance-day"
    CANADA_DAY = "canada-day"
    FETE_NATIONALE = "fete-nationale"
    THANKSGIVING = "thanksgiving"
    NEW_YEAR = "new-year"
    FAMILY_DAY = "family-day"


class CanadianRegion(StrEnum):
    """Canadian regional calendar used by automatic seasonal scheduling."""

    QUEBEC = "ca-qc"
    ONTARIO = "ca-on"
    ALBERTA = "ca-ab"
    BRITISH_COLUMBIA = "ca-bc"
    SASKATCHEWAN = "ca-sk"
    NEW_BRUNSWICK = "ca-nb"
    OTHER_CANADA = "ca-other"


class BehaviorMode(StrEnum):
    """How the active theme is chosen."""

    AUTO = "auto"
    MANUAL = "manual"


class ProjectorLanguage(StrEnum):
    """Language used by the projector's kid-facing on-screen text."""

    ENGLISH = "en"
    FRENCH = "fr"


class EventFrequency(StrEnum):
    """Operator-friendly cadence for intermittent galaxy events."""

    RARE = "rare"
    NORMAL = "normal"
    FREQUENT = "frequent"


DEFAULT_ENABLED_THEMES = (
    GalaxyTheme.DEFAULT,
    GalaxyTheme.HALLOWEEN,
    GalaxyTheme.EASTER,
    GalaxyTheme.CHRISTMAS,
    GalaxyTheme.REMEMBRANCE_DAY,
    GalaxyTheme.CANADA_DAY,
    GalaxyTheme.FETE_NATIONALE,
    GalaxyTheme.THANKSGIVING,
    GalaxyTheme.NEW_YEAR,
    GalaxyTheme.FAMILY_DAY,
)

FAMILY_DAY_REGIONS = frozenset(
    {
        CanadianRegion.ONTARIO,
        CanadianRegion.ALBERTA,
        CanadianRegion.BRITISH_COLUMBIA,
        CanadianRegion.SASKATCHEWAN,
        CanadianRegion.NEW_BRUNSWICK,
    }
)


@dataclass(frozen=True)
class GalaxyBehaviorSettings:
    """Persisted operator choices for the projected galaxy."""

    mode: BehaviorMode = BehaviorMode.AUTO
    manual_theme: GalaxyTheme = GalaxyTheme.DEFAULT
    region: CanadianRegion = CanadianRegion.QUEBEC
    planet_speed: float = 1.0
    ambient_effects: bool = True
    projector_language: ProjectorLanguage = ProjectorLanguage.ENGLISH
    asteroid_belt_enabled: bool = False
    comets_enabled: bool = False
    comet_frequency: EventFrequency = EventFrequency.NORMAL
    flyby_asteroids_enabled: bool = False
    flyby_frequency: EventFrequency = EventFrequency.NORMAL
    enabled_themes: tuple[GalaxyTheme, ...] = DEFAULT_ENABLED_THEMES

    def __post_init__(self) -> None:
        if not 0.25 <= self.planet_speed <= 2.0:
            raise ValueError("planet_speed must be between 0.25 and 2.0")

        # Default is the safe visual fallback and therefore cannot be disabled.
        # De-duplicate values while preserving the operator's persisted order.
        unique = tuple(dict.fromkeys(self.enabled_themes))
        if GalaxyTheme.DEFAULT not in unique:
            unique = (GalaxyTheme.DEFAULT, *unique)
        object.__setattr__(self, "enabled_themes", unique)


@dataclass(frozen=True)
class GalaxyBehavior:
    """Effective projector behavior after schedule/manual resolution."""

    theme: GalaxyTheme
    planet_speed: float
    ambient_effects: bool
    mode: BehaviorMode
    projector_language: ProjectorLanguage = ProjectorLanguage.ENGLISH
    asteroid_belt_enabled: bool = False
    comets_enabled: bool = False
    comet_frequency: EventFrequency = EventFrequency.NORMAL
    flyby_asteroids_enabled: bool = False
    flyby_frequency: EventFrequency = EventFrequency.NORMAL


class SeasonalThemeResolver:
    """Built-in annual scene presets with Canadian regional scheduling."""

    def resolve(
        self,
        day: date,
        region: CanadianRegion = CanadianRegion.QUEBEC,
    ) -> GalaxyTheme:
        """Return the theme that should be active on the given calendar day."""
        # New Year deliberately overrides the surrounding Christmas window.
        if (day.month == 12 and day.day == 31) or (day.month == 1 and day.day == 1):
            return GalaxyTheme.NEW_YEAR

        if (day.month == 12 and 20 <= day.day <= 30) or (
            day.month == 1 and 2 <= day.day <= 6
        ):
            return GalaxyTheme.CHRISTMAS

        if day.month == 11 and day.day == 11:
            return GalaxyTheme.REMEMBRANCE_DAY

        if (day.month == 10 and day.day >= 25) or (day.month == 11 and day.day <= 1):
            return GalaxyTheme.HALLOWEEN

        thanksgiving = self.nth_weekday(day.year, 10, weekday=0, occurrence=2)
        if thanksgiving - timedelta(days=2) <= day <= thanksgiving:
            return GalaxyTheme.THANKSGIVING

        if (day.month == 6 and day.day == 30) or (
            day.month == 7 and day.day <= 2
        ):
            return GalaxyTheme.CANADA_DAY

        if region == CanadianRegion.QUEBEC and day.month == 6 and day.day in (23, 24):
            return GalaxyTheme.FETE_NATIONALE

        if region in FAMILY_DAY_REGIONS:
            family_day = self.nth_weekday(day.year, 2, weekday=0, occurrence=3)
            if family_day - timedelta(days=2) <= day <= family_day:
                return GalaxyTheme.FAMILY_DAY

        easter = self.easter_sunday(day.year)
        if easter - timedelta(days=2) <= day <= easter + timedelta(days=1):
            return GalaxyTheme.EASTER

        return GalaxyTheme.DEFAULT

    @staticmethod
    def nth_weekday(
        year: int,
        month: int,
        *,
        weekday: int,
        occurrence: int,
    ) -> date:
        """Return the requested 1-based weekday occurrence in a month."""
        first = date(year, month, 1)
        offset = (weekday - first.weekday()) % 7
        return first + timedelta(days=offset + (occurrence - 1) * 7)

    @staticmethod
    def easter_sunday(year: int) -> date:
        """Gregorian Easter (Meeus/Jones/Butcher)."""
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
        """Resolve the concrete behaviour that should be applied right now."""
        candidate = (
            self.resolve(day, settings.region)
            if settings.mode == BehaviorMode.AUTO
            else settings.manual_theme
        )
        theme = (
            candidate
            if candidate in settings.enabled_themes
            else GalaxyTheme.DEFAULT
        )
        return GalaxyBehavior(
            theme=theme,
            planet_speed=settings.planet_speed,
            ambient_effects=settings.ambient_effects,
            mode=settings.mode,
            projector_language=settings.projector_language,
            asteroid_belt_enabled=settings.asteroid_belt_enabled,
            comets_enabled=settings.comets_enabled,
            comet_frequency=settings.comet_frequency,
            flyby_asteroids_enabled=settings.flyby_asteroids_enabled,
            flyby_frequency=settings.flyby_frequency,
        )
