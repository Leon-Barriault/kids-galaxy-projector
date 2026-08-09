import pytest

from app.domain.errors import ValidationError
from app.domain.planet_customization import (
    DEFAULT_CRATER_COLOR,
    DEFAULT_MOUNTAIN_COLOR,
    DEFAULT_RING_COLOR,
    normalize_companions,
    normalize_crater_color,
    normalize_mountain_color,
    normalize_planet_style,
    normalize_ring_color,
)


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


@pytest.mark.parametrize(
    ("normalizer", "default"),
    [
        (normalize_ring_color, DEFAULT_RING_COLOR),
        (normalize_crater_color, DEFAULT_CRATER_COLOR),
        (normalize_mountain_color, DEFAULT_MOUNTAIN_COLOR),
    ],
)
def test_feature_colors_default_and_normalize_hex_case(normalizer, default):
    assert normalizer(None) == default
    assert normalizer("  #A1B2C3 ") == "#a1b2c3"


@pytest.mark.parametrize(
    "normalizer",
    [normalize_ring_color, normalize_crater_color, normalize_mountain_color],
)
@pytest.mark.parametrize("value", ["red", "#fff", "#12345678", "123456", "#gg0000"])
def test_invalid_feature_color_is_rejected(normalizer, value):
    with pytest.raises(ValidationError):
        normalizer(value)
