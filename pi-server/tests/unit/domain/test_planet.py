"""
Domain: the Planet entity and the payload contract shared by REST and SSE.
"""

from app.domain.planet import NO_PLANET_PAYLOAD, Planet


def make_planet(**overrides) -> Planet:
    defaults = {
        "id": "abc123",
        "filename": "abc123_My Planet.png",
        "display_name": "My Planet",
        "created_at": 1234.5,
    }
    return Planet(**{**defaults, **overrides})


class TestPlanet:
    def test_url_is_derived_from_filename(self):
        assert make_planet().url == "/uploads/abc123_My Planet.png"

    def test_payload_shape(self):
        payload = make_planet().to_payload()
        assert payload == {
            "has_planet": True,
            "url": "/uploads/abc123_My Planet.png",
            "name": "My Planet",
            "timestamp": 1234.5,
        }

    def test_payload_never_leaks_the_internal_id(self):
        """Regression: the projector used to render '<hex id> My Planet'."""
        planet = make_planet(id="f31fc218ce", filename="f31fc218ce_My Planet.png")
        assert planet.to_payload()["name"] == "My Planet"
        assert "f31fc218ce" not in planet.to_payload()["name"]

    def test_metadata_filename_sits_beside_the_image(self):
        assert make_planet().metadata_filename == "abc123_My Planet.json"

    def test_is_immutable(self):
        planet = make_planet()
        try:
            planet.display_name = "Changed"  # type: ignore[misc]
        except Exception:
            return  # frozen dataclass - expected
        raise AssertionError("Planet should be immutable")


class TestNoPlanetPayload:
    def test_shape(self):
        assert NO_PLANET_PAYLOAD == {"has_planet": False}
