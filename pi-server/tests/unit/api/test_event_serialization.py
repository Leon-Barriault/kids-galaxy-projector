from app.api.sse import serialize_event
from app.application.events import (
    GalaxyBehaviorChanged,
    GalaxyCleared,
    PlanetCreated,
    PlanetRemoved,
)
from app.domain.behavior import (
    BehaviorMode,
    GalaxyBehavior,
    GalaxyTheme,
    ProjectorLanguage,
)
from app.domain.planet import Planet


def planet(**overrides) -> Planet:
    values = {
        "id": "abc",
        "filename": "abc.png",
        "display_name": "Blue World",
        "created_at": 12.5,
    }
    values.update(overrides)
    return Planet(**values)


def test_planet_created_serializes_to_existing_wire_contract():
    assert serialize_event(PlanetCreated(planet())) == (
        "planet",
        {
            "has_planet": True,
            "id": "abc",
            "url": "/uploads/abc.png",
            "name": "Blue World",
            "timestamp": 12.5,
        },
    )


def test_designed_planet_carries_style_companions_and_feature_color():
    assert serialize_event(
        PlanetCreated(
            planet(
                style="spiky",
                companions=("moon", "astronaut"),
                mountain_color="#66bb6a",
            )
        )
    ) == (
        "planet",
        {
            "has_planet": True,
            "id": "abc",
            "url": "/uploads/abc.png",
            "name": "Blue World",
            "timestamp": 12.5,
            "style": "spiky",
            "companions": ["moon", "astronaut"],
            "mountain_color": "#66bb6a",
        },
    )


def test_crater_color_is_carried_by_live_event():
    event_name, payload = serialize_event(
        PlanetCreated(planet(style="cratered", crater_color="#ab47bc"))
    )

    assert event_name == "planet"
    assert payload["crater_color"] == "#ab47bc"


def test_planet_removed_serializes_to_existing_wire_contract():
    assert serialize_event(PlanetRemoved("abc")) == (
        "planet",
        {"has_planet": False, "id": "abc", "removed": True},
    )


def test_galaxy_cleared_serializes_to_existing_wire_contract():
    assert serialize_event(GalaxyCleared()) == (
        "planet",
        {"has_planet": False, "cleared": True},
    )


def test_behavior_changed_has_its_own_typed_sse_channel():
    behavior = GalaxyBehavior(
        theme=GalaxyTheme.HALLOWEEN,
        planet_speed=1.25,
        ambient_effects=True,
        mode=BehaviorMode.MANUAL,
        projector_language=ProjectorLanguage.FRENCH,
    )

    assert serialize_event(GalaxyBehaviorChanged(behavior)) == (
        "behavior",
        {
            "theme": "halloween",
            "planet_speed": 1.25,
            "ambient_effects": True,
            "mode": "manual",
            "projector_language": "fr",
        },
    )
