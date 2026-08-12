#!/usr/bin/env python3
"""Real-WebGL acceptance for the stroke-wrapping planet surface.

The product rule: the colour the child picks is the sphere, and every stroke
they draw keeps its shape and is wrapped around the planet at the height they
drew it. A straight horizontal line is a band right round the ball. A wavy line
stays wavy as it goes round. A line drawn top to bottom spirals from pole to
pole. Paint that reaches a pole owns the whole cap, closing around the stroke so
there is no background left at the top - but only when the paint actually gets
there. A drawing that stops short leaves a pale pole.

This replaces check_latitude_band_projection.py, which asserted the per-row
collapse: every row of the drawing reduced to one colour, so a stroke owned
every latitude it crossed. That was correct for the rainbow it was written
against and wrong for everything else - a vertical line turned 85% of the planet
its colour, a diagonal 78%, a wobbly line came back six times thicker than
drawn, and anything thinner than ten pixels was discarded outright. Those
assertions could not be repaired because they pinned the behaviour being
changed; in particular "every latitude is one colour right around the planet"
is now false by design, and is the thing a crooked line has to violate.

What has not changed, and is still asserted here: the rainbow's vertical order,
the cap, the pale south pole, per-stroke thickness tiers and bevelled edges.
"""

from __future__ import annotations

import io
import math
import sys

from PIL import Image, ImageDraw
from playwright.sync_api import sync_playwright

from check_projector import FAILURES, Server, check, chromium_executable, wait_for

CANVAS = 512
BODY = "#f2f2f2"
BODY_RGB = (242, 242, 242)
# Body level in the height map, matching BODY_HEIGHT in SoftToyPlanetSurface.js.
BODY_LEVEL = 40
# Outermost first, which is also topmost: this is the order they must come back.
ARCS = (("#7b3fb5", 220), ("#e8862f", 170), ("#f0d040", 120), ("#4fae54", 70))
GREEN = "#4fae54"
ORANGE = "#e8862f"


def _clipped(draw_on) -> bytes:
    image = Image.new("RGB", (CANVAS, CANVAS), BODY)
    strokes = Image.new("RGB", (CANVAS, CANVAS), BODY)
    draw_on(ImageDraw.Draw(strokes))
    mask = Image.new("L", (CANVAS, CANVAS), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, CANVAS - 1, CANVAS - 1), fill=255)
    image.paste(strokes, (0, 0), mask)
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def rainbow_disc() -> bytes:
    """The drawing from the report: nested rainbow arcs over a plain body."""

    def paint(draw):
        centre_x, centre_y = CANVAS // 2, 390
        for colour, radius in ARCS:
            # Centring at y=390 leaves real unpainted canvas below the dome,
            # which must come back as the south pole.
            draw.arc(
                (centre_x - radius, centre_y - radius, centre_x + radius, centre_y + radius),
                start=180,
                end=360,
                fill=colour,
                width=44,
            )

    return _clipped(paint)


def vertical_disc(width: int) -> bytes:
    """A line straight down the middle - the case that used to flood the planet."""
    return _clipped(lambda draw: draw.line([(256, 70), (256, 440)], fill=GREEN, width=width))


def over_top_disc() -> bytes:
    """A stroke drawn right over the top of the disc - this one owns the cap.

    Deliberately taken to within a few pixels of the disc's top edge, where the
    tablet's circular clip has narrowed the drawable width to about a fifth of
    the disc. Paint landing there was aimed at the top of the planet.
    """
    return _clipped(
        lambda draw: draw.line(
            [(120, 190), (256, 6), (392, 190)], fill=ARCS[0][0], width=40, joint="curve"
        )
    )


def crooked_disc() -> bytes:
    """A wobbly horizontal line - must stay wobbly once wrapped."""
    return _clipped(
        lambda draw: draw.line(
            [(60, 300), (160, 210), (260, 330), (360, 200), (452, 290)],
            fill=ORANGE,
            width=26,
            joint="curve",
        )
    )


# Returns the finished equirectangular map, downsampled, plus material facts.
# Downsampled in the page rather than shipped whole: 512x256 is 131k pixels and
# crossing the bridge with all of them is slower than the render being checked.
SURFACE_STATE = """
(id) => {
  const planet = window.kidsGalaxy.kidPlanets.get(id);
  const material = planet.mesh.material;
  const read = (image, w, h) => {
    if (!image) return null;
    const c = document.createElement('canvas');
    c.width = image.width; c.height = image.height;
    const ctx = c.getContext('2d', {alpha: false, willReadFrequently: true});
    ctx.drawImage(image, 0, 0);
    const data = ctx.getImageData(0, 0, image.width, image.height).data;
    const out = [];
    for (let y = 0; y < h; y += 1) {
      const sy = Math.min(image.height - 1, Math.round(y * image.height / h));
      const row = [];
      for (let x = 0; x < w; x += 1) {
        const sx = Math.min(image.width - 1, Math.round(x * image.width / w));
        const o = (sy * image.width + sx) * 4;
        row.push([data[o], data[o + 1], data[o + 2]]);
      }
      out.push(row);
    }
    return out;
  };
  const map = material.map?.image;
  return {
    mode: material.userData.kidsGalaxyDesignProjectionMode,
    softToy: Boolean(material.userData.kidsGalaxySoftToySurface),
    strokeCount: material.userData.kidsGalaxyEmbossedBandCount,
    roughness: material.roughness,
    metalness: material.metalness,
    clearcoat: material.clearcoat || 0,
    hasPaintRelief: Boolean(material.bumpMap) && material.bumpScale > 0,
    environmentLit: Boolean(material.envMap),
    sculptedVisible: (planet.sculptedArtworkGroup?.children || []).filter((m) => m.visible).length,
    physical: material.type === 'MeshPhysicalMaterial',
    embossed: Boolean(material.displacementMap) && material.displacementScale > 0,
    textureWidth: map.width,
    textureHeight: map.height,
    colour: read(map, 128, 64),
    relief: read(material.displacementMap?.image, 128, 64),
  };
}
"""


def nearest(rgb, palette):
    """
    Classify a rendered pixel by colour direction, not by absolute distance.

    Stroke edges are darkened to give each pad a contact shadow, and that
    darkening is a uniform multiply across all three channels. Absolute distance
    is not invariant to it: yellow at 78% measures nearer to full orange than to
    full yellow. Normalising to unit length divides the multiply straight out.
    """

    def unit(colour):
        length = math.sqrt(sum(channel * channel for channel in colour)) or 1.0
        return [channel / length for channel in colour]

    target = unit(rgb)

    def distance(candidate):
        return sum((a - b) ** 2 for a, b in zip(target, unit(candidate), strict=True))

    return min(palette, key=lambda entry: distance(palette[entry]))


def hex_rgb(value: str) -> tuple[int, int, int]:
    return tuple(int(value[index : index + 2], 16) for index in (1, 3, 5))


def is_body(rgb) -> bool:
    return math.dist(rgb, BODY_RGB) < 26


def painted_fraction(colour) -> float:
    total = sum(len(row) for row in colour)
    painted = sum(1 for row in colour for pixel in row if not is_body(pixel))
    return painted / total


def read_state(page, planet_id):
    wait_for(
        page,
        f"Boolean(window.kidsGalaxy?.kidPlanets?.get('{planet_id}')"
        "?.mesh?.material?.userData?.kidsGalaxySoftToySurface)",
        20_000,
    )
    return page.evaluate(SURFACE_STATE, planet_id)


def main() -> int:
    palette = {"body": BODY_RGB} | {name: hex_rgb(name) for name, _ in ARCS}

    with Server() as server:
        rainbow_id = server.upload("Rainbow", artwork=rainbow_disc(), body_color=BODY)
        vertical_id = server.upload("Vertical", artwork=vertical_disc(26), body_color=BODY)
        thin_id = server.upload("Thin vertical", artwork=vertical_disc(8), body_color=BODY)
        crooked_id = server.upload("Crooked", artwork=crooked_disc(), body_color=BODY)
        over_id = server.upload("Over the top", artwork=over_top_disc(), body_color=BODY)

        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(
                executable_path=chromium_executable(),
                args=["--use-gl=swiftshader", "--enable-unsafe-swiftshader"],
            )
            page = browser.new_page(viewport={"width": 1000, "height": 800})
            errors: list[str] = []
            page.on("pageerror", lambda error: errors.append(str(error)))
            page.on(
                "console",
                lambda message: errors.append(message.text) if message.type == "error" else None,
            )
            page.goto(f"{server.base}/", wait_until="load")
            rainbow = read_state(page, rainbow_id)
            vertical = read_state(page, vertical_id)
            thin = read_state(page, thin_id)
            crooked = read_state(page, crooked_id)
            over = read_state(page, over_id)
            browser.close()

    print("\nsurface contract")
    check(rainbow["softToy"], "the drawing is painted onto the body")
    check(
        rainbow["mode"] == "strokes-wrapped-around-longitude",
        f"diagnostics record the stroke-wrapping mapping ({rainbow['mode']})",
    )
    check(rainbow["sculptedVisible"] == 0, "superseded sculpted slabs stay hidden")
    check(rainbow["strokeCount"] == 4, f"each rainbow arc is its own stroke ({rainbow['strokeCount']})")

    print("\nvertical order is the drawing's vertical order")
    # Read the column through the apex of the arcs - longitude 180, the middle
    # of the map - which is where the child's own view down the drawing lands.
    colour = rainbow["colour"]
    middle = len(colour[0]) // 2
    rows = [nearest(row[middle], palette) for row in colour]

    # Collapse into runs and drop the short ones. Filtering by a colour's total
    # share does not work here: the arcs are 44px strokes spaced 50px apart, so
    # the child's own drawing has a thin sliver of background between each pair,
    # and this mapping is faithful enough to keep them. Those slivers are one
    # row each and are noise; the body below the dome is nineteen and is the
    # south pole. Counting "body" as a single total cannot tell them apart.
    runs: list[list] = []
    for name in rows:
        if runs and runs[-1][0] == name:
            runs[-1][1] += 1
        else:
            runs.append([name, 1])
    floor = max(2, int(len(rows) * 0.03))
    kept = [name for name, length in runs if length >= floor]
    # Body runs are dropped rather than asserted in sequence. Where background
    # legitimately appears is the poles' business, checked on its own below, and
    # it moved once caps became conditional - the rainbow now has a pale pole
    # above the purple. Pinning it in both places means one behaviour change
    # breaking two assertions and neither of them saying what went wrong.
    painted_order = [name for name in kept if name != "body"]
    significant = [
        name
        for index, name in enumerate(painted_order)
        if index == 0 or name != painted_order[index - 1]
    ]
    expected = ["#7b3fb5", "#e8862f", "#f0d040", "#4fae54"]
    check(significant == expected, f"north to south reads {' -> '.join(significant)}")

    print("\na pole is capped only when paint actually reaches it")
    # Every longitude of the top row, not just one: a cap with background in it
    # anywhere is a hole at the top of the planet. A stroke drawn over the top
    # rarely arrives across every longitude at once, so closing the cap has to
    # fill around the stroke rather than above it.
    over_top = [nearest(pixel, palette) for pixel in over["colour"][0]]
    check(
        set(over_top) == {"#7b3fb5"},
        f"a stroke drawn over the top owns the whole cap, no gaps ({set(over_top)})",
    )
    # And the other way. This reverses the previous behaviour, which extended the
    # topmost colour to the pole unconditionally: a rainbow whose apex sits a
    # third of the way down the drawing left the entire northern hemisphere in
    # that colour, and so did a wavy line drawn across the middle. Untouched
    # canvas above a drawing is a pale pole and is meant to show.
    check(
        all(is_body(pixel) for pixel in colour[0]),
        "a drawing that stops short of the top leaves a pale north pole",
    )
    check(
        all(is_body(pixel) for pixel in crooked["colour"][0]),
        "a wavy line mid-drawing does not repaint the northern hemisphere",
    )
    check(
        all(is_body(pixel) for pixel in colour[-1]),
        "unpainted canvas below the drawing returns as the south pole",
    )

    print("\na stroke keeps the shape it was drawn with")
    # The wobble is the point. Find the latitude of the paint at each longitude;
    # a wavy line must land at different heights around the planet, which is
    # exactly what the old per-row collapse could not express.
    latitudes = []
    for x in range(len(crooked["colour"][0])):
        column = [y for y, row in enumerate(crooked["colour"]) if not is_body(row[x])]
        # Skip the cap, which is legitimately flat, by taking the lowest paint.
        if column:
            latitudes.append(max(column))
    spread = (max(latitudes) - min(latitudes)) if latitudes else 0
    check(spread >= 6, f"a crooked line stays crooked around the planet (spread {spread} rows)")

    print("\na vertical stroke no longer floods the planet")
    # This is the regression that prompted the change: a line down the middle
    # used to claim every latitude it crossed and repaint most of the ball.
    flooded = painted_fraction(vertical["colour"])
    check(flooded < 0.45, f"a vertical line covers a sensible share of the planet ({flooded:.0%})")
    check(flooded > 0.02, f"a vertical line is actually on the planet ({flooded:.0%})")
    # And the other end of the same cliff: under the old rule anything thinner
    # than ~10px of a row was discarded as a slip of the finger.
    thin_fraction = painted_fraction(thin["colour"])
    check(thin_fraction > 0.01, f"a thin vertical line survives at all ({thin_fraction:.1%})")
    check(thin["strokeCount"] == 1, f"the thin line is recognised as one stroke ({thin['strokeCount']})")

    print("\nmoulded painted-toy finish")
    check(0.35 <= rainbow["roughness"] <= 0.7, f"body holds a soft sheen ({rainbow['roughness']})")
    check(rainbow["metalness"] == 0, "planet body is not metallic")
    check(rainbow["clearcoat"] > 0, "planet body carries a painted-toy coat")
    check(rainbow["physical"], "body material still supports the sheen properties other stages set")
    check(rainbow["hasPaintRelief"], "painted strokes stand off the body")
    check(rainbow["embossed"], "painted strokes are embossed into the geometry")
    check(rainbow["environmentLit"], "planet body picks up soft image-based light")

    print("\nstrokes are embossed at their own thicknesses")
    relief = rainbow["relief"]
    check(bool(relief), "the stroke thickness profile is readable")
    if relief:
        column = [row[middle][0] for row in relief]
        peaks = []
        current = []
        for value in column:
            if value > BODY_LEVEL + 6:
                current.append(value)
            elif current:
                peaks.append(max(current))
                current = []
        if current:
            peaks.append(max(current))
        tiers = {round(peak / 12) for peak in peaks}
        check(len(peaks) >= 3, f"each stroke gets its own raised pad ({len(peaks)} found)")
        check(len(tiers) >= 2, f"pads sit at more than one thickness ({len(tiers)} tiers)")
        shoulders = sum(
            1 for value in column if BODY_LEVEL + 6 < value < max(column) - 12
        )
        check(shoulders >= 3, f"pad edges are bevelled rather than square ({shoulders} rows)")

    print("\ncost")
    # Longitude carries information now, so the map cannot be eight columns
    # wide - but it must not be 1024 either. Twelve planets at 1024 was 72 MB of
    # canvas and as much again in texture memory.
    check(
        rainbow["textureWidth"] <= 512 and rainbow["textureHeight"] <= 256,
        f"map stays within budget ({rainbow['textureWidth']}x{rainbow['textureHeight']})",
    )

    print("\nconsole")
    check(not errors, f"no browser console errors ({errors[:3]})")

    if FAILURES:
        print(f"\n{len(FAILURES)} check(s) failed:")
        for failure in FAILURES:
            print(f"  - {failure}")
        return 1
    print("\ndrawing projection acceptance passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
