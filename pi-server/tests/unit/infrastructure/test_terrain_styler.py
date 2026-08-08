"""
Infrastructure: the eight palette colours become eight terrains.

The look is a judgement call and not worth pinning pixel by pixel. What is
worth pinning is the mapping - that blue really does come back as water and
not as desert - and the properties that would silently break it.
"""

import io

import numpy as np
import pytest
from PIL import Image, ImageDraw

from app.infrastructure.terrain_styler import (
    TERRAIN_NAMES,
    TERRAINS,
    TerrainSurfaceStyler,
)

SIZE = (256, 128)


def png(image: Image.Image) -> bytes:
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def open_png(data: bytes) -> Image.Image:
    return Image.open(io.BytesIO(data)).convert("RGB")


@pytest.fixture
def styler():
    return TerrainSurfaceStyler()


def painted(colour: tuple[int, int, int]) -> bytes:
    """A canvas filled entirely with one palette colour."""
    return png(Image.new("RGB", SIZE, colour))


def mean_rgb(image: Image.Image) -> tuple[float, float, float]:
    pixels = np.asarray(image, dtype=np.float32)
    return tuple(pixels.reshape(-1, 3).mean(axis=0))


class TestClassification:
    def test_every_palette_colour_maps_to_its_own_terrain(self):
        """The mapping is the feature; this is the test that guards it."""
        for index, (name, colour) in enumerate(TERRAINS.items()):
            block = np.full((4, 4, 3), colour, dtype=np.uint8)
            labels = TerrainSurfaceStyler.classify(block)
            assert (labels == index).all(), f"{name} misclassified"
            assert TERRAIN_NAMES[index] == name

    def test_a_colour_between_two_palette_entries_picks_the_nearer(self):
        blue = np.array(TERRAINS["water"], dtype=np.int16)
        green = np.array(TERRAINS["forest"], dtype=np.int16)
        mostly_blue = (blue * 0.8 + green * 0.2).astype(np.uint8)
        block = np.full((2, 2, 3), mostly_blue, dtype=np.uint8)

        labels = TerrainSurfaceStyler.classify(block)

        assert TERRAIN_NAMES[labels[0, 0]] == "water"


class TestTerrainLooksRight:
    def test_blue_becomes_water_not_something_else(self, styler):
        """Blue in, blue-dominant out - and darker than the flat crayon blue."""
        result = open_png(styler.style(painted(TERRAINS["water"])))
        r, g, b = mean_rgb(result)
        assert b > r + 40 and b > g + 10

    def test_green_becomes_forest(self, styler):
        r, g, b = mean_rgb(open_png(styler.style(painted(TERRAINS["forest"]))))
        assert g > r + 20 and g > b + 20

    def test_orange_lava_is_bright_enough_to_glow(self, styler):
        """
        The projector reuses the albedo as its emissive map, so the glowing
        channels have to be genuinely bright in the texture - there is no
        second map carrying them.
        """
        pixels = np.asarray(open_png(styler.style(painted(TERRAINS["lava"]))))
        brightest = pixels.reshape(-1, 3).max(axis=0)
        assert brightest[0] > 200, "lava has no hot channels"

    def test_black_becomes_rock_rather_than_a_black_hole(self, styler):
        """Pure black on a sphere reads as a hole; basalt has to be visible."""
        r, g, b = mean_rgb(open_png(styler.style(painted(TERRAINS["basalt"]))))
        assert max(r, g, b) > 25

    def test_each_terrain_is_visibly_different_from_the_others(self, styler):
        """A mapping where two terrains render alike is not a mapping."""
        means = {
            name: mean_rgb(open_png(styler.style(painted(colour))))
            for name, colour in TERRAINS.items()
        }
        for a in means:
            for b in means:
                if a < b:
                    pairs = zip(means[a], means[b], strict=True)
                    distance = sum((x - y) ** 2 for x, y in pairs) ** 0.5
                    assert distance > 20, f"{a} and {b} look the same"


class TestStructure:
    def test_output_keeps_the_texture_size(self, styler):
        assert open_png(styler.style(painted(TERRAINS["water"]))).size == SIZE

    def test_is_deterministic(self, styler):
        source = painted(TERRAINS["forest"])
        assert styler.style(source) == styler.style(source)

    def test_two_different_drawings_do_not_share_a_world(self, styler):
        """Seeded from the drawing, so noise differs between planets."""
        a = np.asarray(open_png(styler.style(painted(TERRAINS["desert"]))))
        image = Image.new("RGB", SIZE, TERRAINS["desert"])
        ImageDraw.Draw(image).rectangle([0, 0, 3, 3], fill=TERRAINS["water"])
        b = np.asarray(open_png(styler.style(png(image))))
        assert not np.array_equal(a, b)

    def test_a_mixed_drawing_produces_several_terrains(self, styler):
        image = Image.new("RGB", SIZE, TERRAINS["water"])
        draw = ImageDraw.Draw(image)
        draw.rectangle([10, 10, 90, 60], fill=TERRAINS["forest"])
        draw.rectangle([150, 60, 240, 118], fill=TERRAINS["lava"])

        result = np.asarray(open_png(styler.style(png(image))))

        # Crude but sufficient: a single-terrain planet has far fewer distinct
        # colours than one carrying water, forest and lava at once.
        distinct = len(np.unique(result.reshape(-1, 3), axis=0))
        assert distinct > 40, f"only {distinct} distinct colours"

    def test_the_white_page_is_gone(self, styler):
        """Same promise as the plain blend: no paper left on the sphere."""
        image = Image.new("RGB", SIZE, (255, 255, 255))
        ImageDraw.Draw(image).ellipse([110, 50, 145, 80], fill=TERRAINS["forest"])

        result = open_png(styler.style(png(image)))

        greyscale = list(result.convert("L").getdata())
        white = sum(1 for p in greyscale if p >= 238) / len(greyscale)
        assert white < 0.05, f"still {white:.0%} white"


class TestDisabled:
    def test_passthrough_when_switched_off(self):
        source = painted(TERRAINS["water"])
        assert TerrainSurfaceStyler(enabled=False).style(source) == source
