"""
Turns the eight tablet colours into eight kinds of terrain.

    blue   -> water        green  -> forest
    orange -> lava         red    -> volcanic rupture
    purple -> gas bands    pink   -> cloud pockets
    yellow -> desert       black  -> basalt

The look is deliberately cartoonish: flat posterised bands rather than smooth
shading, saturated colour, and dark ink where one terrain meets another. A
child should be able to point at the projector and say "that green bit is my
forest" - photorealism would lose exactly the thing that makes it theirs.

Runs after the same diffusion pass the plain blend uses, so a drawing of a few
strokes becomes regions of colour before anything is classified. Without that
step a scribble would classify as a scribble, and the planet would be white
paper with thin ribbons of terrain on it.
"""

import io
import logging
import math

import numpy as np
from PIL import Image, ImageFilter

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
_PALETTE = np.array(list(TERRAINS.values()), dtype=np.int16)

#: Terrain is generated at this fraction of the texture and scaled up. The
#: cartoon look is all flat bands and blobs, so there is little fine detail to
#: lose, and the noise generation is the expensive part.
TERRAIN_DOWNSCALE = 2


class TerrainSurfaceStyler(SurfaceStyler):
    """
    :param enabled: when false, returns the upload untouched
    :param ink:     0..1 strength of the dark outline between terrains
    """

    def __init__(self, *, enabled: bool = True, ink: float = 0.75, seed: int = 0):
        self._enabled = enabled
        self._ink = ink
        self._seed = seed
        # Flat settings: this pass exists only to spread the colours into
        # regions. Grain, softening and saturation are the terrain renderer's
        # job, and doing them twice muddies the classification.
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
            return self._encode(self._render(rgb, self._seed_for(png_bytes)))
        except (OSError, ValueError) as e:
            # Cosmetic. A planet that looks like paper beats a failed upload.
            logger.warning("Terrain styling failed, using the raw drawing: %s", e)
            return png_bytes

    # -------------------- classification --------------------

    @staticmethod
    def classify(rgb: np.ndarray) -> np.ndarray:
        """
        Nearest palette colour per pixel, as an index into TERRAIN_NAMES.

        Squared distance in plain RGB. A perceptual space would classify the
        in-between pixels the diffusion creates more sensibly, but those sit on
        a boundary either way, and the ink line drawn along that boundary hides
        the difference entirely.
        """
        diff = rgb[:, :, None, :].astype(np.int16) - _PALETTE[None, None, :, :]
        return np.argmin((diff.astype(np.int32) ** 2).sum(axis=3), axis=2)

    # -------------------- rendering --------------------

    def _render(self, rgb: np.ndarray, seed: int) -> Image.Image:
        full_h, full_w = rgb.shape[:2]
        small = (
            max(64, full_h // TERRAIN_DOWNSCALE),
            max(128, full_w // TERRAIN_DOWNSCALE),
        )
        scaled = np.asarray(
            Image.fromarray(rgb).resize(
                (small[1], small[0]), Image.Resampling.BILINEAR
            )
        )
        labels = self.classify(scaled)

        out = np.zeros((*small, 3), dtype=np.float32)
        for index, name in enumerate(TERRAIN_NAMES):
            mask = labels == index
            if mask.any():
                out[mask] = _terrain(name, small, seed + index * 37)[mask]

        out *= 1.0 - _outline(labels)[..., None] * self._ink
        image = Image.fromarray(np.clip(out, 0, 255).astype(np.uint8))
        return image.resize((full_w, full_h), Image.Resampling.BICUBIC)

    @staticmethod
    def _seed_for(png_bytes: bytes) -> int:
        """Same drawing, same world - but two drawings differ."""
        import hashlib

        return int.from_bytes(hashlib.sha256(png_bytes).digest()[:4], "big")

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
    """Sharp creases - what cracks, channels and ruptures are made of."""
    return 1.0 - np.abs(2.0 * _fbm(shape, seed, octaves, base_cells) - 1.0)


def _posterise(values: np.ndarray, levels: int) -> np.ndarray:
    """Cel shading: continuous shading collapses into a few flat bands."""
    return np.floor(np.clip(values, 0, 1) * levels) / (levels - 1)


def _ramp(shade: np.ndarray, dark, light) -> np.ndarray:
    dark = np.array(dark, dtype=np.float32)
    light = np.array(light, dtype=np.float32)
    weight = shade[..., None]
    return dark * (1 - weight) + light * weight


def _outline(labels: np.ndarray) -> np.ndarray:
    """
    Dark ink where one terrain meets another.

    This single line does most of the cartoon work. Without it the terrains
    fade into one another and the whole thing reads as an airbrush again.
    """
    edges = np.zeros(labels.shape, dtype=bool)
    edges[:-1, :] |= labels[:-1, :] != labels[1:, :]
    edges[:, :-1] |= labels[:, :-1] != labels[:, 1:]
    thickened = Image.fromarray((edges * 255).astype(np.uint8)).filter(
        ImageFilter.MaxFilter(3)
    )
    return np.asarray(thickened, dtype=np.float32) / 255.0


# ---------------------------------------------------------------- terrain ----


def _terrain(name: str, shape: tuple[int, int], seed: int) -> np.ndarray:
    noise = _fbm(shape, seed)

    if name == "water":
        # Flat blue with lighter shallows; the bands read as depth contours.
        return _ramp(_posterise(noise * 0.9 + 0.05, 4), (0x0D, 0x47, 0xA1), (0x64, 0xB5, 0xF6))

    if name == "forest":
        canopy = _posterise(_fbm(shape, seed + 7, base_cells=14), 4)
        return _ramp(canopy, (0x1B, 0x5E, 0x20), (0x81, 0xC7, 0x84))

    if name == "desert":
        dunes = _posterise(_fbm(shape, seed + 5, base_cells=8), 4)
        return _ramp(dunes, (0xE6, 0x8A, 0x00), (0xFF, 0xE0, 0x82))

    if name == "lava":
        # Cooled crust broken by glowing channels. The bright values matter:
        # the projector feeds the albedo back in as its emissive map, so the
        # channels light up without needing a second texture.
        crust = _ramp(_posterise(noise, 3), (0x3E, 0x27, 0x23), (0x6D, 0x4C, 0x41))
        glow = _posterise(np.clip((_ridged(shape, seed + 100) - 0.62) / 0.38, 0, 1), 4)[..., None]
        hot = np.array([0xFF, 0xC1, 0x07], dtype=np.float32)
        molten = np.array([0xFF, 0x57, 0x22], dtype=np.float32)
        return crust * (1 - glow) + (molten * (1 - glow * 0.5) + hot * glow * 0.5) * glow

    if name == "volcano":
        rock = _ramp(_posterise(noise, 3), (0x26, 0x14, 0x12), (0x5D, 0x40, 0x37))
        rupture = _posterise(
            np.clip((_ridged(shape, seed + 31, base_cells=3) - 0.80) / 0.2, 0, 1), 3
        )[..., None]
        return rock * (1 - rupture) + np.array([0xFF, 0x3D, 0x00], dtype=np.float32) * rupture

    if name == "gas":
        # Latitude bands, warped by noise so they are not stripes on a ruler.
        height, width = shape
        latitude = np.linspace(0, 1, height, dtype=np.float32)[:, None].repeat(width, axis=1)
        warp = _fbm(shape, seed + 3, base_cells=4)
        bands = np.sin((latitude * 14 + warp * 2.2) * math.pi) * 0.5 + 0.5
        return _ramp(_posterise(bands, 5), (0x4A, 0x14, 0x8C), (0xE1, 0xBE, 0xE7))

    if name == "cloud":
        puff = _posterise(np.clip(_fbm(shape, seed + 11, base_cells=10) * 1.35 - 0.2, 0, 1), 4)
        return _ramp(puff, (0xF0, 0x6E, 0xA8), (0xFF, 0xFF, 0xFF))

    # basalt
    speckle = _posterise(_fbm(shape, seed + 13, base_cells=20), 3)
    return _ramp(speckle, (0x21, 0x25, 0x21), (0x60, 0x6C, 0x71))
