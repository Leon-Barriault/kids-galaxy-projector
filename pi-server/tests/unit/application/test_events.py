from dataclasses import FrozenInstanceError

import pytest

from app.application.events import GalaxyCleared, PlanetCreated, PlanetRemoved
from app.domain.planet import Planet


def make_planet() -> Planet:
    return Planet(
        id="p1",
        filename="p1.png",
        display_name="Planet One",
        created_at=1.0,
    )


def test_planet_created_carries_the_domain_entity():
    planet = make_planet()
    assert PlanetCreated(planet).planet is planet


def test_planet_removed_carries_only_the_stable_identity():
    assert PlanetRemoved("p1").planet_id == "p1"


def test_galaxy_cleared_is_a_distinct_event_type():
    assert isinstance(GalaxyCleared(), GalaxyCleared)


@pytest.mark.parametrize(
    "event",
    [PlanetCreated(make_planet()), PlanetRemoved("p1"), GalaxyCleared()],
)
def test_events_are_immutable(event):
    with pytest.raises(FrozenInstanceError):
        event.extra = True
