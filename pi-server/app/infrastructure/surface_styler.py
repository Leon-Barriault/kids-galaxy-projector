"""
Turns a drawing into a planet surface.

A child draws marker strokes on white paper. Wrapped straight onto a sphere
that is exactly what it looks like: a white ball with a stripe on it. This
takes the colours they actually used and spreads them across the whole world,
then lays the strokes back on top so they still recognise their own planet.

Pillow does the blurring; numpy does the arithmetic the fill needs. That split
is not cosmetic - see _diffuse, where dividing one blur by another is what
stops white paper bleeding into the child's colours.
"""

import hashlib
import io
import logging
import random

import numpy as np
from PIL import Image, ImageChops, ImageEnhance, ImageFilter

from app.ports import SurfaceStyler

logger = logging.getLogger(__name__)

#: Above this greyscale value a pixel counts as untouched paper.
PAPER_THRESHOLD = 238

#: The colour wash is low-frequency, so it is computed this many times
#: smaller and scaled back up. Purely a speed trade, and an enormous one.
DIFFUSION_DOWNSCALE = 4


class PillowSurfaceStyler(SurfaceStyler):
    """
    The "balanced" preset: paper fully replaced, strokes kept at 80%.

    Every parameter is a constructor argument rather than a constant so the
    look can be retuned from the composition root without touching this file.

    :param diffusion_passes: passes at each scale; more means a smoother wash
    :param keep_strokes:     0..1, how much of the original drawing survives
    :param soften:           final blur radius taking the marker edge off
    :param mottle:           0..1, strength of the surface grain
    :param saturation:       projectors wash colour out; this puts it back
    """

    def __init__(
        self,
        *,
        enabled: bool = True,
        diffusion_passes: int = 3,
        keep_strokes: float = 0.80,
        soften: float = 2.5,
        mottle: float = 0.16,
        saturation: float = 1.18,
    ):
        self._enabled = enabled
        self._diffusion_passes = diffusion_passes
        self._keep_strokes = keep_strokes
        self._soften = soften
        self._mottle = mottle
        self._saturation = saturation

    def style(self, png_bytes: bytes) -> bytes:
        if not self._enabled:
            # Byte-for-byte passthrough, not a re-encode: an operator who turns
            # this off should get exactly what the tablet sent.
            return png_bytes

        try:
            with Image.open(io.BytesIO(png_bytes)) as opened:
                image = opened.convert("RGB")
                # Seeded from the drawing itself: the same planet always looks
                # the same, but two planets do not share identical grain.
                seed = int.from_bytes(hashlib.sha256(png_bytes).digest()[:8], "big")
                return self._encode(self._apply(image, seed))
        except OSError as e:
            # Styling is cosmetic. A planet that looks like paper is much
            # better than an upload that fails, so fall back to the original.
            logger.warning("Surface styling failed, using the raw drawing: %s", e)
            return png_bytes

    # -------------------- the effect --------------------

    def _apply(self, image: Image.Image, seed: int) -> Image.Image:
        mask = self._drawn_mask(image)

        wash = self._diffuse(image, mask)
        base = self._restore_strokes(image, wash, mask)

        if self._soften > 0:
            base = Image.blend(
                base, base.filter(ImageFilter.GaussianBlur(self._soften)), 0.5
            )

        if self._mottle > 0:
            base = self._add_grain(base, seed)

        return ImageEnhance.Color(base).enhance(self._saturation)

    @staticmethod
    def _drawn_mask(image: Image.Image) -> Image.Image:
        """White where the child drew, black on untouched paper."""
        return image.convert("L").point(
            lambda p: 0 if p >= PAPER_THRESHOLD else 255
        )

    def _diffuse(self, image: Image.Image, mask: Image.Image) -> Image.Image:
        """
        Bleed the drawn colours outwards until the paper is gone.

        Normalised convolution, coarse to fine. Each round blurs the colour
        that is *known*, blurs the record of where it is known, and divides one
        by the other, so only drawn colour propagates.

        Plainly blurring the whole image is the obvious version and it is
        wrong: it drags the white paper inwards along with the colour, the two
        fight, and the result converges on something close to white. A child
        who drew one small shape got a pale ghost of it on a still-white
        world. Worse, that was invisible in testing - the grain pass darkens
        everything just enough to slip under the "is any white left" threshold,
        so the check passed for entirely the wrong reason.

        The descending radius matters too. A fixed small one cannot cross a
        large empty region in any sane number of rounds; a fixed large one
        smears the detail near the strokes into mud. Starting wide fills the
        world, finishing narrow keeps the edges.
        """
        # Computed at a quarter resolution and scaled back up. The wash is
        # low-frequency by construction, so the detail is not there to lose -
        # and the blurs that dominate the cost get sixteen times cheaper. At
        # full size this took the better part of two seconds on a laptop, which
        # on a Pi would have been longer than the upload cooldown.
        full = image.size
        small = (max(64, full[0] // DIFFUSION_DOWNSCALE),
                 max(32, full[1] // DIFFUSION_DOWNSCALE))

        # BOX averaging plus a "> 0" threshold, so a stroke thinner than one
        # low-resolution cell still counts as drawn instead of disappearing and
        # leaving nothing to diffuse from.
        small_mask = mask.resize(small, Image.Resampling.BOX).point(
            lambda p: 255 if p > 0 else 0
        )
        if not small_mask.getbbox():
            return image  # nothing was drawn; there is nothing to spread

        source = np.asarray(
            image.resize(small, Image.Resampling.BILINEAR), dtype=np.float32
        )
        drawn = np.asarray(small_mask, dtype=np.float32) / 255.0
        known = drawn > 0.5

        filled = source * drawn[..., None]
        weight = drawn.copy()
        radius = max(small) / 4.0

        while radius >= 1.0:
            for _ in range(self._diffusion_passes):
                numerator = _blur(filled, radius, "RGB")
                denominator = _blur(weight * 255.0, radius, "L")
                covered = denominator > 1.0

                estimate = filled.copy()
                estimate[covered] = (
                    numerator[covered] * 255.0 / denominator[covered][..., None]
                )

                filled = np.where(known[..., None], source, estimate)
                weight = np.maximum(drawn, covered.astype(np.float32))
            radius /= 2.0

        spread = Image.fromarray(np.clip(filled, 0, 255).astype(np.uint8), "RGB")
        return spread.resize(full, Image.Resampling.BICUBIC)

    def _restore_strokes(
        self, original: Image.Image, wash: Image.Image, mask: Image.Image
    ) -> Image.Image:
        """
        Put the drawing back over the wash.

        Without this the planet is a pretty gradient that the child cannot
        recognise as the thing they drew, which rather defeats the point of
        letting them draw it.

        The two-step composite is not redundant. Feathering straight from the
        original paints a white halo around every stroke: just outside a
        stroke the original *is* white paper, so a soft-edged mask blends that
        white back in. Laying the strokes onto the wash with a hard edge first
        means the feather has wash on both sides of the boundary and there is
        no white left to find. It showed up worst on sparse drawings - three
        strokes on an empty canvas, which is most of what a child actually
        draws.
        """
        # Eroded first. A stroke is drawn anti-aliased, so its outermost ring
        # of pixels is a blend of ink and paper - light, but still under the
        # paper threshold, so it counts as drawn and gets painted back as a
        # pale fringe tracing every line. MinFilter drops that ring, and the
        # feather below re-softens the edge from the *stroke's* colour rather
        # than from the paper's.
        solid = mask.filter(ImageFilter.MinFilter(3))
        strokes_on_wash = Image.composite(original, wash, solid)
        feathered = solid.filter(ImageFilter.GaussianBlur(4)).point(
            lambda p: int(p * self._keep_strokes)
        )
        return Image.composite(strokes_on_wash, wash, feathered)

    def _add_grain(self, image: Image.Image, seed: int) -> Image.Image:
        """
        Multi-octave value noise. Real surfaces are never flat, and a little
        grain is what stops the blend reading as an airbrush gradient.
        """
        noise = self._fractal_noise(image.size, seed=seed)
        strength = self._mottle
        scaled = noise.point(
            lambda p: max(0, min(255, int(255 - strength * 255 + (p - 128) * strength * 2)))
        )
        grained = ImageChops.multiply(image, Image.merge("RGB", (scaled,) * 3))
        # Multiplying only ever darkens; put the average level back.
        return ImageEnhance.Brightness(grained).enhance(1 + strength * 0.8)

    @staticmethod
    def _fractal_noise(
        size: tuple[int, int], *, seed: int, octaves: int = 4
    ) -> Image.Image:
        """
        Value noise built from a seeded RNG rather than Image.effect_noise,
        which draws from Pillow's internal generator and cannot be seeded -
        that made the same drawing produce a different planet every time it
        was styled.

        Each octave is generated at a low resolution and scaled up, which is
        both cheaper than blurring full-size noise and gives rounder blobs.
        """
        rng = random.Random(seed)
        accumulated = Image.new("L", size, 128)
        amplitude = 1.0
        for octave in range(octaves):
            cells = 4 << octave
            layer_size = (max(2, cells), max(2, cells // 2))
            raw = bytes(
                rng.randrange(256) for _ in range(layer_size[0] * layer_size[1])
            )
            layer = Image.frombytes("L", layer_size, raw).resize(
                size, Image.Resampling.BICUBIC
            )
            layer = layer.point(lambda p, a=amplitude: int(128 + (p - 128) * a))
            accumulated = ImageChops.blend(accumulated, layer, 0.5)
            amplitude *= 0.65
        return accumulated

    @staticmethod
    def _encode(image: Image.Image) -> bytes:
        # No optimize=True. It tries several zlib strategies and on a smooth,
        # grainy image like this one it cost roughly 700ms for a few percent of
        # size - nine tenths of the whole operation, spent while a child waits.
        buffer = io.BytesIO()
        image.save(buffer, format="PNG")
        return buffer.getvalue()


def _blur(values: np.ndarray, radius: float, mode: str) -> np.ndarray:
    """Gaussian blur of a float array, via Pillow's fast integer implementation."""
    image = Image.fromarray(np.clip(values, 0, 255).astype(np.uint8), mode)
    return np.asarray(
        image.filter(ImageFilter.GaussianBlur(radius)), dtype=np.float32
    )
