"""System clock adapter for seasonal scene resolution."""

from datetime import date

from app.ports import Clock


class SystemClock(Clock):
    def today(self) -> date:
        return date.today()
