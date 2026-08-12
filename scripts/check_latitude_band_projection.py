#!/usr/bin/env python3
"""Real-WebGL acceptance for the latitude-band planet surface.

The product rule, in the words it was asked for: the colour the child picks is
the sphere, and every line they draw becomes a band right around the planet at
the height they drew it. A rainbow drawn as nested arcs must arrive as a purple
cap over orange, yellow and green rings, with untouched canvas coming back as
body colour at the south pole - the vertical order of the drawing, in the
vertical order of the planet.

This replaces check_sculpted_renderer, check_artwork_coverage, check_stroke_wrap
and check_area_fill_latitude_projection. Those asserted the architecture this
one replaces: each coloured region extruded into a slab, scaled to fill 94% of
the body and wound 480 degrees of longitude, which is what turned a blob into a
ribbon lapping the planet. They were pinning the appearance being complained
about, so they could not be repaired - only replaced.
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
# Concentric semicircles, outermost first - which is also topmost.
ARCS = (("#7b3fb5", 220), ("#e8862f", 170), ("#f0d040", 120), ("#4fae54", 70))


def rainbow_disc() -> bytes:
    """The drawing from the report: nested rainbow arcs over a plain body."""
    image = Image.new("RGB", (CANVAS, CANVAS), BODY)
    strokes = Image.new("RGB", (CANVAS, CANVAS), BODY)
    draw = ImageDraw.Draw(strokes)
    centre_x, centre_y = CANVAS // 2, 390
    for colour, radius in ARCS:
        # True semicircles. Tall narrow ellipses would make the innermost colour
        # the nearest paint to the centre across a huge vertical range, letting
        # green swallow a third of the planet - a property of the drawing, not
        # of the mapping. Centring at y=390 also leaves real unpainted canvas
        # below the dome, which must come back as the south pole.
        draw.arc(
            (centre_x - radius, centre_y - radius, centre_x + radius, centre_y + radius),
            start=180,
            end=360,
            fill=colour,
            width=44,
        )

    mask = Image.new("L", (CANVAS, CANVAS), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, CANVAS - 1, CANVAS - 1), fill=255)
    image.paste(strokes, (0, 0), mask)
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


SURFACE_STATE = """
(id) => {
  const planet = window.kidsGalaxy.kidPlanets.get(id);
  const material = planet.mesh.material;
  const image = material.map?.image;
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext('2d', {alpha: false, willReadFrequently: true});
  context.drawImage(image, 0, 0);

  // Read the finished equirectangular texture: column 0 and the middle column.
  // A band that truly goes all the way round is identical in both.
  const columnAt = (x) => {
    const data = context.getImageData(x, 0, 1, canvas.height).data;
    const out = [];
    for (let y = 0; y < canvas.height; y += 1) {
      out.push([data[y * 4], data[y * 4 + 1], data[y * 4 + 2]]);
    }
    return out;
  };

  return {
    mode: material.userData.kidsGalaxyDesignProjectionMode,
    softToy: Boolean(material.userData.kidsGalaxySoftToySurface),
    roughness: material.roughness,
    metalness: material.metalness,
    clearcoat: material.clearcoat || 0,
    hasPaintRelief: Boolean(material.bumpMap) && material.bumpScale > 0,
    reliefColumn: (() => {
      // The displacement map is the band thickness profile. Read one column of
      // it to see how many distinct thicknesses the bands were actually given.
      const relief = material.displacementMap?.image;
      if (!relief) return [];
      const c = document.createElement('canvas');
      c.width = relief.width;
      c.height = relief.height;
      const ctx = c.getContext('2d', {alpha: false, willReadFrequently: true});
      ctx.drawImage(relief, 0, 0);
      const data = ctx.getImageData(0, 0, 1, c.height).data;
      const out = [];
      for (let y = 0; y < c.height; y += 1) out.push(data[y * 4]);
      return out;
    })(),
    environmentLit: Boolean(material.envMap),
    sculptedVisible: (planet.sculptedArtworkGroup?.children || []).filter((m) => m.visible).length,
    physical: material.type === 'MeshPhysicalMaterial',
    embossed: Boolean(material.displacementMap) && material.displacementScale > 0,
    textureWidth: image.width,
    height: canvas.height,
    front: columnAt(0),
    side: columnAt(Math.floor(canvas.width / 2)),
  };
}
"""


def nearest(rgb, palette):
    """
    Classify a rendered pixel by colour direction, not by absolute distance.

    Band edges are darkened to give each pad a contact shadow, and that darkening
    is a uniform multiply across all three channels. Absolute distance is not
    invariant to it: yellow at 78% measures nearer to full orange than to full
    yellow, so a shaded yellow shoulder was being reported as an extra orange
    band between yellow and green. Normalising to unit length divides the
    multiply straight out, which is exactly the property needed here.
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


def main() -> int:
    palette = {"body": BODY_RGB} | {name: hex_rgb(name) for name, _ in ARCS}

    with Server() as server:
        planet_id = server.upload("Rainbow", artwork=rainbow_disc(), body_color=BODY)

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
            wait_for(
                page,
                f"Boolean(window.kidsGalaxy?.kidPlanets?.get('{planet_id}')"
                "?.mesh?.material?.userData?.kidsGalaxySoftToySurface)",
                20_000,
            )
            state = page.evaluate(SURFACE_STATE, planet_id)
            browser.close()

    print("\nsurface contract")
    check(state["softToy"], "the drawing is painted onto the body")
    check(
        state["mode"] == "drawing-rows-as-latitude-bands",
        "diagnostics record the latitude-band mapping",
    )
    check(state["sculptedVisible"] == 0, "superseded sculpted slabs stay hidden")

    print("\nbands go all the way around")
    # Every band must be identical at longitude 0 and longitude 180. This is the
    # literal request - "I need it to be drawn all around the sphere" - and it is
    # the one property the old 480-degree winding could never satisfy, because a
    # stroke that laps the planet by 120 degrees differs at every longitude.
    differing = sum(
        1
        for front, side in zip(state["front"], state["side"], strict=True)
        if max(abs(a - b) for a, b in zip(front, side, strict=True)) > 2
    )
    check(differing == 0, f"every latitude is one colour right around the planet ({differing} differ)")

    print("\nvertical order is the drawing's vertical order")
    rows = [nearest(rgb, palette) for rgb in state["front"]]
    # Collapse to the sequence of bands, ignoring how thick each one is.
    sequence = [name for index, name in enumerate(rows) if index == 0 or name != rows[index - 1]]
    # Thin transitional slivers between bands are anti-aliasing, not bands.
    counts = {name: rows.count(name) for name in set(rows)}
    significant = [name for name in sequence if counts[name] >= state["height"] * 0.04]
    expected = ["#7b3fb5", "#e8862f", "#f0d040", "#4fae54", "body"]
    check(
        significant == expected,
        f"north to south reads {' -> '.join(significant)}",
    )
    # The topmost band owns the cap. Arcing paint over the top of the disc leaves
    # a sliver of untouched canvas above the apex, and a child reads that arc as
    # the top of their planet - a purple stripe under a cap of background is not
    # what they drew.
    check(rows[0] == "#7b3fb5", "the topmost band covers the whole north pole")
    check(rows[-1] == "body", "unpainted canvas below the drawing returns as the south pole")

    print("\nmoulded painted-toy finish")
    # A fully matte body came back as "the plastic rendering is lost". The look
    # wanted is a painted toy, which needs a coat - broad and soft, not a glassy
    # pinpoint, so roughness stays mid and the clearcoat is roughened too.
    check(0.35 <= state["roughness"] <= 0.7, f"body holds a soft sheen (roughness {state['roughness']})")
    check(state["metalness"] == 0, "planet body is not metallic")
    check(state["clearcoat"] > 0, "planet body carries a painted-toy coat")
    check(state["physical"], "body material still supports the sheen properties other stages set")
    check(state["hasPaintRelief"], "painted bands stand off the body")
    # Relief the eye can check on the outline, not only in the shading.
    check(state["embossed"], "painted bands are embossed into the geometry")
    check(state["environmentLit"], "planet body picks up soft image-based light")

    print("\nbands are embossed at their own thicknesses")
    relief = state["reliefColumn"]
    check(bool(relief), "the band thickness profile is readable")
    if relief:
        # Group the profile into runs and take each run's peak. A single
        # thickness for all paint reads as one sticker wrapped round the ball;
        # the reference planets are pads laid on at different thicknesses.
        peaks = []
        current = []
        for value in relief:
            if value > BODY_LEVEL + 6:
                current.append(value)
            elif current:
                peaks.append(max(current))
                current = []
        if current:
            peaks.append(max(current))
        tiers = {round(peak / 12) for peak in peaks}
        check(len(peaks) >= 3, f"each band gets its own raised pad ({len(peaks)} found)")
        check(len(tiers) >= 2, f"pads sit at more than one thickness ({len(tiers)} tiers)")
        # A pad with no shoulder is a cliff; the references round every edge.
        shoulders = sum(
            1
            for index in range(1, len(relief))
            if BODY_LEVEL + 6 < relief[index] < max(relief) - 12
        )
        check(shoulders >= 8, f"pad edges are bevelled rather than square ({shoulders} rows)")

    print("\ncost")
    # Bands are constant in longitude, so a wide texture stores the same colour
    # thousands of times per row. Twelve planets at 1024 wide was 72 MB of canvas
    # and as much again in texture memory, for no visible difference.
    check(state["textureWidth"] <= 16, f"band texture stays narrow ({state['textureWidth']} px)")


    print("\nconsole")
    check(not errors, f"no browser console errors ({errors[:3]})")

    if FAILURES:
        print(f"\n{len(FAILURES)} check(s) failed:")
        for failure in FAILURES:
            print(f"  - {failure}")
        return 1
    print("\nlatitude band projection acceptance passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
