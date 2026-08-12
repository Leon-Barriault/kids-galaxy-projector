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
import sys

from PIL import Image, ImageDraw
from playwright.sync_api import sync_playwright

from check_projector import FAILURES, Server, check, chromium_executable, wait_for

CANVAS = 512
BODY = "#f2f2f2"
BODY_RGB = (242, 242, 242)
# Outermost first, which is also topmost: this is the order they must come back.
ARCS = (("#7b3fb5", 40), ("#e8862f", 96), ("#f0d040", 152), ("#4fae54", 208))


def rainbow_disc() -> bytes:
    """The drawing from the report: nested rainbow arcs over a plain body."""
    image = Image.new("RGB", (CANVAS, CANVAS), BODY)
    strokes = Image.new("RGB", (CANVAS, CANVAS), BODY)
    draw = ImageDraw.Draw(strokes)
    for colour, inset in ARCS:
        top = inset + 40
        # arc(180..360) is the upper half, so the dome's flat bottom lands at
        # (top + bottom) / 2. Anchoring that at 390 of 512 leaves real unpainted
        # canvas below the drawing, which is what must return as body colour.
        draw.arc((inset, top, CANVAS - inset, 780 - top), start=180, end=360, fill=colour, width=46)

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
    environmentLit: Boolean(material.envMap),
    sculptedVisible: (planet.sculptedArtworkGroup?.children || []).filter((m) => m.visible).length,
    height: canvas.height,
    front: columnAt(0),
    side: columnAt(Math.floor(canvas.width / 2)),
  };
}
"""


def nearest(rgb, palette):
    def distance(candidate):
        return sum((a - b) ** 2 for a, b in zip(rgb, candidate, strict=True))

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
    expected = ["body", "#7b3fb5", "#e8862f", "#f0d040", "#4fae54", "body"]
    check(
        significant == expected,
        f"north to south reads {' -> '.join(significant)}",
    )
    check(rows[0] == "body", "the north pole keeps the body colour above the drawing")
    check(rows[-1] == "body", "unpainted canvas below the drawing returns as the south pole")

    print("\nsoft matte finish")
    check(state["roughness"] >= 0.8, f"planet body is matte (roughness {state['roughness']})")
    check(state["metalness"] == 0, "planet body is not metallic")
    check(state["clearcoat"] == 0, "planet body carries no gloss coat")
    check(state["hasPaintRelief"], "painted bands stand off the body")
    check(state["environmentLit"], "planet body picks up soft image-based light")

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
