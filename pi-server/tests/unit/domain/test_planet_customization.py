import pytest

from app.domain.errors import ValidationError
from app.domain.planet_customization import normalize_companions, normalize_planet_style


def test_style_defaults_to_classic():
    assert normalize_planet_style(None) == "classic"


@pytest.mark.parametrize("style", ["classic", "ringed", "cratered", "spiky"])
def test_available_styles_are_accepted(style):
    assert normalize_planet_style(style.upper()) == style


def test_unknown_style_is_rejected():
    with pytest.raises(ValidationError):
        normalize_planet_style("cube")


def test_companions_are_normalized_deduplicated_and_ordered():
    assert normalize_companions("moon, stars,moon, astronaut") == (
        "moon",
        "stars",
        "astronaut",
    )


def test_unknown_companion_is_rejected():
    with pytest.raises(ValidationError):
        normalize_companions("moon,dragon")
