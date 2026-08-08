"""
Gives each palette colour the character of a kind of terrain.

    blue   -> water swell     green  -> forest canopy
    orange -> lava channels   red    -> volcanic rupture
    purple -> gas bands       pink   -> cloud puffs
    yellow -> desert dunes    black  -> basalt speckle

Read this before changing it, because the obvious version is the wrong one.

The first attempt *replaced* colours: blue became a realistic deep navy, green
became forest-floor green, regions were separated by hard ink outlines and
shaded in flat posterised bands. It was rejected on sight, and the reason is
worth keeping. A planet stopped being the child's drawing and became a
generated world that happened to be shaped like it. Nobody in the room could
point at it and say "that is mine".

So terrain here is a *modulation*, never a substitution. The base is exactly
the colour they drew; each region only gains a signed brightness pattern on
top - slow swell in water, clumps in forest, ridged channels in lava - plus a
small additive glow for the two things that should look hot. Membership is
soft and normalised, so regions fade into one another the way the plain blend
already does rather than switching at a boundary.

Runs after the blend's diffusion pass. Children draw strokes, not filled
regions; classify a raw scribble and you get thin ribbons of texture on white
paper. Diffusing first turns each colour into an area, and the area is what
takes on a character.
"""

import hashlib
import io
import logging
import math

import numpy as np
from PIL import Image

from app.infrastructure.surface_styler import PillowSurfaceStyler
from app.ports import SurfaceStyler

logger = logging.getLogger(__name__)

#: The tablet palette, in the order it appears in DrawingControls.kt.
TERRAINS: dict[str, tuple[int, int, int]] = {
    "volcano": (0xE5, 0x39, 0x35),
    "lava": (0xFF, 0x98, 0x00),
    "desert": (0xFF, 0xEB, 0x3B),
    "forest": (0x4C, 0xAF, 0x50),
    "water": (0x21, 0x96, 0xF3),
    "gas": (0x9C, 0x27, 0xB0),
    "cloud": (0xE9, 0x1E, 0x63),
    "basalt": (0x00, 0x00, 0x00),
}
TERRAIN_NAMES = list(TERRAINS)
_PALETTE = np.array(list(TERRAINS.values()), dtype=np.float32)

#: How far a colour can sit from a palette entry and still belong to it, in
#: RGB distance. Wide on purpose: the diffusion creates a continuum, and hard
#: membership is what produced visible seams in the rejected version.
MEMBERSHIP_SIGMA = 95.0

#: Generated at this fraction of the texture and scaled up. The patterns are
#: low-frequency, so nothing is lost, and the noise is the expensive part.
TERRAIN_DOWNSCALE = 2

#: Only these two brighten. Everything else is pure modulation.
GLOW_COLOURS = {
    "lava": np.array([255, 150, 40], dtype=np.float32),
    "volcano": np.array([255, 80, 20], dtype=np.float32),
}


class TerrainSurfaceStyler(SurfaceStyler):
    """
    :param strength:      how strongly terrain modulates the drawn colour.
                          0.18 is invisible at projector distance, 0.48 starts
                          to look mottled; 0.32 was chosen on a real projector.
    :param glow_strength: additive warmth for lava and volcanic rupture. This
                          does lighten the orange a child drew - a known and
                          accepted trade, not an oversight.
    """

    def __init__(
        self,
        *,
        enabled: bool = True,
        strength: float = 0.32,
        glow_strength: float = 0.67,
    ):
        self._enabled = enabled
        self._strength = strength
        self._glow_strength = glow_strength
        # Flat settings: this pass exists only to spread the colours into
        # regions. Grain and saturation are handled here, and doing them twice
        # muddies the membership weights.
        self._diffuser = PillowSurfaceStyler(
            mottle=0.0, soften=0.0, saturation=1.0, keep_strokes=1.0
        )

    def style(self, png_bytes: bytes) -> bytes:
        if not self._enabled:
            return png_bytes
        try:
            spread = self._diffuser.style(png_bytes)
            with Image.open(io.BytesIO(spread)) as opened:
                rgb = np.asarray(opened.convert("RGB"))
            seed = int.from_bytes(hashlib.sha256(png_bytes).digest()[:4], "big")
            return self._encode(self._render(rgb, seed))
        except (OSError, ValueError) as e:
            # Cosmetic. A planet that looks like paper beats a failed upload.
            logger.warning("Terrain styling failed, using the raw drawing: %s", e)
            return png_bytes

    @staticmethod
    def membership(rgb: np.ndarray, sigma: float = MEMBERSHIP_SIGMA) -> np.ndarray:
        """
        Soft, normalised similarity to each palette colour.

        A Gaussian rather than a nearest-neighbour pick. Nearest-neighbour puts
        a seam wherever two terrains meet, and the previous version had to draw
        an ink line along that seam to make it look deliberate. Soft weights
        remove the seam instead of decorating it.
        """
        distances = (
            (rgb[:, :, None, :].astype(np.float32) - _PALETTE[None, None, :, :]) ** 2
        ).sum(axis=3)
        weights = np.exp(-distances / (2 * sigma * sigma))
        return weights / np.clip(weights.sum(axis=2, keepdims=True), 1e-6, None)

    def _render(self, rgb: np.ndarray, seed: int) -> Image.Image:
        full_height, full_width = rgb.shape[:2]
        shape = (
            max(64, full_height // TERRAIN_DOWNSCALE),
            max(128, full_width // TERRAIN_DOWNSCALE),
        )
        base = np.asarray(
            Image.fromarray(rgb).resize(
                (shape[1], shape[0]), Image.Resampling.BILINEAR
            ),
            dtype=np.float32,
        )
        weights = self.membership(base)

        modulation = np.zeros(shape, dtype=np.float32)
        warmth = np.zeros((*shape, 3), dtype=np.float32)

        for index, name in enumerate(TERRAIN_NAMES):
            weight = weights[:, :, index]
            # Skip terrains the child did not use: each one costs several
            # octaves of noise, and most drawings use three or four colours.
            if weight.max() < 0.02:
                continue
            modulation += weight * _detail(name, shape, seed + index * 37)
            glow = _glow(name, shape, seed + index * 37)
            if glow is not None:
                warmth += (weight * glow)[..., None] * GLOW_COLOURS[name]

        out = base * (1.0 + modulation[..., None] * self._strength)
        out += warmth * self._glow_strength

        styled = Image.fromarray(np.clip(out, 0, 255).astype(np.uint8))
        return styled.resize((full_width, full_height), Image.Resampling.BICUBIC)

    @staticmethod
    def _encode(image: Image.Image) -> bytes:
        buffer = io.BytesIO()
        image.save(buffer, format="PNG")
        return buffer.getvalue()


# ------------------------------------------------------------------ noise ----


def _value_noise(shape: tuple[int, int], cells: int, seed: int) -> np.ndarray:
    """Smooth noise in [0,1]: generated tiny, scaled up. Cheap and round."""
    height, width = shape
    rng = np.random.default_rng(seed)
    grid = rng.random((max(2, cells // 2), max(2, cells)))
    upscaled = Image.fromarray((grid * 255).astype(np.uint8)).resize(
        (width, height), Image.Resampling.BICUBIC
    )
    return np.asarray(upscaled, dtype=np.float32) / 255.0


def _fbm(shape, seed, octaves=5, base_cells=6) -> np.ndarray:
    total = np.zeros(shape, dtype=np.float32)
    amplitude, norm = 1.0, 0.0
    for octave in range(octaves):
        total += amplitude * _value_noise(shape, base_cells << octave, seed + octave)
        norm += amplitude
        amplitude *= 0.5
    return total / norm


def _ridged(shape, seed, octaves=5, base_cells=6) -> np.ndarray:
    """Sharp creases - what channels and ruptures are made of."""
    return 1.0 - np.abs(2.0 * _fbm(shape, seed, octaves, base_cells) - 1.0)


# ---------------------------------------------------------------- terrain ----


def _detail(name: str, shape: tuple[int, int], seed: int) -> np.ndarray:
    """
    Signed brightness modulation, roughly [-1, 1].

    Signed matters: it averages to about zero, so a region keeps the colour the
    child drew and only gains structure within it. A positive-only pattern
    would drift the whole area lighter and undo the point of the exercise.
    """
    if name == "water":
        return (_fbm(shape, seed, base_cells=5) - 0.5) * 1.6  # slow swell

    if name == "forest":
        return (_fbm(shape, seed + 7, base_cells=16) - 0.5) * 2.0  # canopy clumps

    if name == "desert":
        return (_fbm(shape, seed + 5, base_cells=9) - 0.5) * 1.5  # dunes

    if name == "lava":
        return (_ridged(shape, seed + 100, base_cells=7) - 0.45) * 2.0  # channels

    if name == "volcano":
        return (_ridged(shape, seed + 31, base_cells=4) - 0.55) * 2.2  # ruptures

    if name == "gas":
        height, width = shape
        latitude = np.linspace(0, 1, height, dtype=np.float32)[:, None].repeat(
            width, axis=1
        )
        warp = _fbm(shape, seed + 3, base_cells=4)
        return np.sin((latitude * 11 + warp * 2.0) * math.pi) * 0.9

    if name == "cloud":
        return (_fbm(shape, seed + 11, base_cells=11) - 0.45) * 1.8  # puffs

    return (_fbm(shape, seed + 13, base_cells=22) - 0.5) * 1.4  # basalt speckle


def _glow(name: str, shape: tuple[int, int], seed: int) -> np.ndarray | None:
    """
    Positive-only warmth, for the two terrains that should look hot.

    Thresholded high so it appears as narrow channels rather than a wash - the
    projector reuses the albedo as its emissive map, so whatever is bright here
    is what lights up on the night side.
    """
    if name == "lava":
        return np.clip((_ridged(shape, seed + 100, base_cells=7) - 0.72) / 0.28, 0, 1)
    if name == "volcano":
        return np.clip((_ridged(shape, seed + 31, base_cells=4) - 0.84) / 0.16, 0, 1)
    return None
