"""Behavioural tests for the immutable Scene domain snapshot."""

import pytest

from app.domain.planet import Planet
from app.domain.scene import Scene


def make_planet(planet_id: str) -> Planet:
    return Planet(
        id=planet_id,
        filename=f"{planet_id}.png",
        display_name=f"Planet {planet_id}",
        created_at=1234.5,
    )


class TestScene:
    def test_contains_the_planets_in_order(self):
        first = make_planet("first")
        second = make_planet("second")

        scene = Scene((first, second))

        assert scene.planets == (first, second)

    def test_takes_a_snapshot_of_the_input_collection(self):
        planets = [make_planet("first")]

        scene = Scene(planets)
        planets.append(make_planet("second"))

        assert scene.planets == (make_planet("first"),)

    def test_exposes_planets_as_an_immutable_collection(self):
        scene = Scene([make_planet("first")])

        assert isinstance(scene.planets, tuple)

    def test_is_immutable(self):
        scene = Scene([make_planet("first")])

        with pytest.raises(AttributeError):
            scene.planets = (make_planet("second"),)  # type: ignore[misc]

    def test_empty_scene_is_valid(self):
        assert Scene(()).planets == ()
