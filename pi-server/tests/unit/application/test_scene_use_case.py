from app.application.use_cases import GetCurrentSceneUseCase
from app.domain.planet import Planet


class FakePlanetRepository:
    def __init__(self, planets):
        self.planets = list(planets)
        self.requested_limit = None

    def recent(self, limit):
        self.requested_limit = limit
        return list(reversed(self.planets))[:limit]


def planet(planet_id: str) -> Planet:
    return Planet(
        id=planet_id,
        filename=f"{planet_id}.png",
        display_name=planet_id.title(),
        created_at=1.0,
    )


def test_current_scene_is_built_from_recent_planets():
    repository = FakePlanetRepository([planet("one"), planet("two")])

    scene = GetCurrentSceneUseCase(repository, max_planets=12).execute()

    assert scene.planets == (planet("two"), planet("one"))
    assert repository.requested_limit == 12


def test_current_scene_respects_the_configured_limit():
    repository = FakePlanetRepository([planet("one"), planet("two"), planet("three")])

    scene = GetCurrentSceneUseCase(repository, max_planets=2).execute()

    assert [item.id for item in scene.planets] == ["three", "two"]
    assert repository.requested_limit == 2


def test_current_scene_is_empty_when_there_are_no_planets():
    scene = GetCurrentSceneUseCase(FakePlanetRepository([])).execute()

    assert scene.planets == ()
