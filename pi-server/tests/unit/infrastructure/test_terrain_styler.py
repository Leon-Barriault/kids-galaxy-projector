"""
Infrastructure: terrain as a texture over the child's own colours.

The look is a judgement call and not worth pinning pixel by pixel. What is
worth pinning is the thing that got the first attempt rejected - that terrain
must never replace the colour a child drew - and the properties that would
silently undo it.
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


def painted(colour: tuple[int, int, int]) -> bytes:
    return png(Image.new("RGB", SIZE, colour))


def mean_rgb(image: Image.Image) -> tuple[float, float, float]:
    return tuple(np.asarray(image, dtype=np.float32).reshape(-1, 3).mean(axis=0))


def hue_signature(rgb: tuple[float, float, float]) -> tuple[float, float]:
    """Channel differences - what makes blue read as blue, independent of level."""
    r, g, b = rgb
    return (r - g, g - b)


@pytest.fixture
def styler():
    return TerrainSurfaceStyler()


class TestItStaysTheirDrawing:
    """
    The whole reason this styler was rewritten. The first version turned blue
    into a realistic deep navy, and the planet stopped looking like the child's
    drawing. Terrain modulates; it must not substitute.
    """

    @pytest.mark.parametrize(
        "name", ["water", "forest", "desert", "gas", "cloud", "basalt"]
    )
    def test_the_drawn_colour_survives(self, styler, name):
        colour = TERRAINS[name]
        result = mean_rgb(open_png(styler.style(painted(colour))))

        drawn = hue_signature(colour)
        styled = hue_signature(result)
        for before, after in zip(drawn, styled, strict=True):
            assert abs(before - after) < 45, f"{name}: hue moved {before} -> {after}"

    def test_brightness_is_not_dragged_far_either(self, styler):
        """
        The modulation is signed and averages near zero, so a region keeps its
        level. A positive-only pattern would wash every planet lighter.
        """
        colour = TERRAINS["forest"]
        before = sum(colour) / 3
        after = sum(mean_rgb(open_png(styler.style(painted(colour))))) / 3
        assert abs(after - before) < 30

    def test_lava_is_allowed_to_brighten(self, styler):
        """
        The one accepted exception: lava and volcano add warmth, which does
        lighten the orange. Known trade, chosen deliberately.
        """
        before = sum(TERRAINS["lava"]) / 3
        after = sum(mean_rgb(open_png(styler.style(painted(TERRAINS["lava"]))))) / 3
        assert after > before


class TestItActuallyDoesSomething:
    def test_a_flat_colour_gains_structure(self, styler):
        """A styler that changed nothing would pass every test above."""
        # Luminance, not the raw RGB array: a solid colour has a large spread
        # *across channels* and measuring that would prove nothing.
        flat = np.asarray(Image.new("RGB", SIZE, TERRAINS["water"]).convert("L"), dtype=np.float32)
        styled = np.asarray(
            open_png(styler.style(painted(TERRAINS["water"]))).convert("L"), dtype=np.float32
        )

        assert flat.std() == 0
        assert styled.std() > 3, "no texture was added"

    def test_each_terrain_has_its_own_pattern(self, styler):
        """Water swell and forest canopy must not be the same noise."""
        patterns = {}
        for name in ("water", "forest", "lava", "gas"):
            grey = open_png(styler.style(painted(TERRAINS[name]))).convert("L")
            arr = np.asarray(grey, dtype=np.float32)
            patterns[name] = (arr - arr.mean()) / max(arr.std(), 1e-6)

        for a in patterns:
            for b in patterns:
                if a < b:
                    correlation = float((patterns[a] * patterns[b]).mean())
                    assert abs(correlation) < 0.9, f"{a} and {b} share a pattern"

    def test_strength_zero_leaves_the_colour_alone(self):
        """The knob is real: at zero this is the diffusion and nothing else."""
        quiet = TerrainSurfaceStyler(strength=0.0, glow_strength=0.0)
        styled = np.asarray(
            open_png(quiet.style(painted(TERRAINS["water"]))).convert("L"), dtype=np.float32
        )
        assert styled.std() < 2


class TestMembershipIsSoft:
    def test_weights_are_normalised(self):
        block = np.full((4, 4, 3), TERRAINS["water"], dtype=np.uint8)
        weights = TerrainSurfaceStyler.membership(block)
        assert weights.shape[-1] == len(TERRAIN_NAMES)
        assert np.allclose(weights.sum(axis=2), 1.0)

    def test_a_palette_colour_belongs_mostly_to_its_own_terrain(self):
        for index, colour in enumerate(TERRAINS.values()):
            block = np.full((2, 2, 3), colour, dtype=np.uint8)
            weights = TerrainSurfaceStyler.membership(block)
            assert weights[0, 0].argmax() == index

    def test_a_colour_between_two_entries_belongs_partly_to_both(self):
        """
        The point of soft membership. Nearest-neighbour put a seam here, and
        the rejected version had to draw an ink line along it to look
        deliberate.
        """
        blue = np.array(TERRAINS["water"], dtype=np.float32)
        green = np.array(TERRAINS["forest"], dtype=np.float32)
        block = np.full((2, 2, 3), (blue + green) / 2, dtype=np.uint8)

        weights = TerrainSurfaceStyler.membership(block)[0, 0]

        water = weights[TERRAIN_NAMES.index("water")]
        forest = weights[TERRAIN_NAMES.index("forest")]
        assert water > 0.05 and forest > 0.05, f"hard split: {water}, {forest}"


class TestStructure:
    def test_output_keeps_the_texture_size(self, styler):
        assert open_png(styler.style(painted(TERRAINS["water"]))).size == SIZE

    def test_is_deterministic(self, styler):
        source = painted(TERRAINS["forest"])
        assert styler.style(source) == styler.style(source)

    def test_two_drawings_do_not_share_a_world(self, styler):
        a = np.asarray(open_png(styler.style(painted(TERRAINS["desert"]))))
        image = Image.new("RGB", SIZE, TERRAINS["desert"])
        ImageDraw.Draw(image).rectangle([0, 0, 3, 3], fill=TERRAINS["water"])
        b = np.asarray(open_png(styler.style(png(image))))
        assert not np.array_equal(a, b)

    def test_the_white_page_is_gone(self, styler):
        """Same promise as the plain blend: no paper left on the sphere."""
        image = Image.new("RGB", SIZE, (255, 255, 255))
        ImageDraw.Draw(image).ellipse([110, 50, 145, 80], fill=TERRAINS["forest"])

        greyscale = list(open_png(styler.style(png(image))).convert("L").getdata())
        white = sum(1 for p in greyscale if p >= 238) / len(greyscale)
        assert white < 0.05, f"still {white:.0%} white"

    def test_passthrough_when_switched_off(self):
        source = painted(TERRAINS["water"])
        assert TerrainSurfaceStyler(enabled=False).style(source) == source
