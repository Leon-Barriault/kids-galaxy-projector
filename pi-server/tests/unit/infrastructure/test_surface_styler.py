"""
Infrastructure: turning a child's drawing into a planet surface.

The whole point is that a drawing is marker on white paper and a planet is not.
These assert the properties that matter rather than exact pixels - the look is
a judgement call, but "the paper is gone" and "it is still their colours" are
not.
"""

import io

import pytest
from PIL import Image, ImageDraw

from app.infrastructure.surface_styler import PillowSurfaceStyler

SIZE = (256, 128)


def png(image: Image.Image) -> bytes:
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def open_png(data: bytes) -> Image.Image:
    return Image.open(io.BytesIO(data)).convert("RGB")


def white_fraction(image: Image.Image, threshold: int = 238) -> float:
    greyscale = image.convert("L")
    pixels = list(greyscale.getdata())
    return sum(1 for p in pixels if p >= threshold) / len(pixels)


@pytest.fixture
def styler():
    return PillowSurfaceStyler()


@pytest.fixture
def drawing() -> Image.Image:
    """A stroke of red and a stroke of blue on white paper."""
    image = Image.new("RGB", SIZE, (255, 255, 255))
    draw = ImageDraw.Draw(image)
    draw.rectangle([20, 20, 90, 50], fill=(220, 40, 40))
    draw.rectangle([150, 70, 230, 110], fill=(40, 60, 220))
    return image


class TestOutputIsUsable:
    def test_returns_a_png_of_the_same_size(self, styler, drawing):
        result = open_png(styler.style(png(drawing)))
        assert result.size == SIZE

    def test_is_deterministic(self, styler, drawing):
        """
        Same drawing, same planet. A styler seeded from the clock would make
        every re-render of a stored planet subtly different, and would make
        this suite flaky.
        """
        source = png(drawing)
        assert styler.style(source) == styler.style(source)


class TestThePaperGoesAway:
    def test_white_background_is_replaced(self, styler, drawing):
        before = white_fraction(drawing)
        after = white_fraction(open_png(styler.style(png(drawing))))

        assert before > 0.6, "fixture should start mostly white"
        assert after < 0.05, f"white paper should be gone, still {after:.0%}"

    def test_a_drawing_that_never_touched_the_edges_still_fills_the_sphere(
        self, styler
    ):
        """A single blob in the middle has to colour the whole world."""
        image = Image.new("RGB", SIZE, (255, 255, 255))
        ImageDraw.Draw(image).ellipse([110, 50, 145, 80], fill=(30, 180, 90))

        result = open_png(styler.style(png(image)))

        assert white_fraction(result) < 0.05


class TestItIsStillTheirColours:
    def test_the_colours_drawn_are_the_colours_that_spread(self, styler, drawing):
        result = open_png(styler.style(png(drawing)))

        # Sample where each stroke was: the hue must survive the blend.
        red = result.getpixel((55, 35))
        blue = result.getpixel((190, 90))
        assert red[0] > red[2] + 40, f"red stroke lost its hue: {red}"
        assert blue[2] > blue[0] + 40, f"blue stroke lost its hue: {blue}"

    def test_a_colour_never_used_does_not_appear(self, styler):
        """
        Diffusion must spread what is there, not invent. A drawing with no
        green in it should not come back with green in it.
        """
        image = Image.new("RGB", SIZE, (255, 255, 255))
        ImageDraw.Draw(image).rectangle([40, 30, 200, 90], fill=(200, 40, 40))

        result = open_png(styler.style(png(image)))

        greenest = max(g - max(r, b) for r, g, b in result.getdata())
        assert greenest < 30, f"invented green: +{greenest}"


class TestDegenerateInputs:
    def test_a_blank_drawing_does_not_raise(self, styler):
        """
        Nothing to diffuse. It must come back unchanged-ish rather than divide
        by an empty mask - the upload rules allow a blank canvas through.
        """
        blank = Image.new("RGB", SIZE, (255, 255, 255))
        result = open_png(styler.style(png(blank)))
        assert result.size == SIZE

    def test_a_fully_covered_drawing_does_not_raise(self, styler):
        covered = Image.new("RGB", SIZE, (120, 40, 200))
        result = open_png(styler.style(png(covered)))
        assert result.size == SIZE
        assert white_fraction(result) < 0.05

    def test_rgba_input_is_accepted(self, styler):
        """Alpha reaches here from some Android encoders; it must not crash."""
        image = Image.new("RGBA", SIZE, (255, 255, 255, 255))
        ImageDraw.Draw(image).rectangle([20, 20, 90, 50], fill=(220, 40, 40, 255))
        result = open_png(styler.style(png(image)))
        assert result.size == SIZE


class TestDisabled:
    def test_passthrough_when_switched_off(self, drawing):
        """
        An operator who dislikes the effect should get the raw drawing back
        byte for byte, not a re-encode of it.
        """
        source = png(drawing)
        assert PillowSurfaceStyler(enabled=False).style(source) == source
