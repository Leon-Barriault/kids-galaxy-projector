#!/usr/bin/env python3
"""Real-WebGL contract for tablet-authored drawing manifests.

The uploaded PNG in this test is intentionally blank. Every visible coloured
stroke therefore has to come from the JSON sidecar, proving the projector does
not reverse-engineer new tablet drawings from raster pixels.
"""

from __future__ import annotations

import io
import json

import httpx
from PIL import Image
from playwright.sync_api import sync_playwright

from check_projector import FAILURES, Server, check, chromium_executable, wait_for

BODY = (255, 255, 255)
PURPLE = (123, 31, 162)
ORANGE = (245, 124, 0)
GREEN = (67, 160, 71)


def blank_png() -> bytes:
    image = Image.new("RGB", (512, 512), BODY)
    output = io.BytesIO()
    image.save(output, format="PNG")
    return output.getvalue()


def manifest_bytes() -> bytes:
    return json.dumps(
        {
            "version": 1,
            "coordinate_space": "normalized-canvas-v1",
            "canvas": {"width": 512, "height": 512},
            "background_color": "#ffffff",
            "background_explicit": True,
            "strokes": [
                {
                    "order": 0,
                    "color": "#7b1fa2",
                    "width_px": 48,
                    "width_normalized": 0.09375,
                    # Reaches the north-pole intent band and should close the cap.
                    "points": [[0.12, 0.045], [0.5, 0.07], [0.88, 0.05]],
                },
                {
                    "order": 1,
                    "color": "#f57c00",
                    "width_px": 38,
                    "width_normalized": 0.07421875,
                    # Short source stroke: projector must stretch its own X span
                    # across the complete longitude, not leave a front-side patch.
                    "points": [[0.28, 0.34], [0.5, 0.37], [0.72, 0.33]],
                },
                {
                    "order": 2,
                    "color": "#43a047",
                    "width_px": 30,
                    "width_normalized": 0.05859375,
                    # Tall stroke: must remain a meridian-like path rather than
                    # flooding every longitude at every latitude it crosses.
                    "points": [[0.48, 0.48], [0.53, 0.68], [0.49, 0.88]],
                },
            ],
            "raster": {
                "background_fill": "solid",
                "stroke_cap": "round",
                "stroke_join": "round",
                "stroke_order": "oldest-to-newest",
            },
        }
    ).encode()


def upload_manifest_planet(server: Server) -> str:
    response = httpx.post(
        f"{server.base}/api/upload",
        files={
            "file": ("blank.png", blank_png(), "image/png"),
            "manifest": ("drawing-manifest.json", manifest_bytes(), "application/json"),
        },
        data={"name": "Manifest Strokes", "body_color": "#ffffff"},
        timeout=10,
    )
    response.raise_for_status()
    payload = response.json()
    check(
        isinstance(payload.get("drawing_manifest_url"), str),
        "upload response exposes the drawing manifest sidecar",
    )
    return payload["planet_id"]


SURFACE_STATE = """
(id) => {
  const p = window.kidsGalaxy.kidPlanets.get(id);
  if (!p) return null;
  const m = p.mesh.material;
  const image = m.map?.image;
  const relief = m.displacementMap?.image;
  if (!image || !relief) return null;
  const read = (source) => {
    const c = document.createElement('canvas');
    c.width = source.width; c.height = source.height;
    const ctx = c.getContext('2d', {alpha: false, willReadFrequently: true});
    ctx.drawImage(source, 0, 0);
    return Array.from(ctx.getImageData(0, 0, source.width, source.height).data);
  };
  return {
    manifest: Boolean(p.drawingManifest),
    manifestSurface: Boolean(m.userData.kidsGalaxyManifestStrokeSurface),
    mode: m.userData.kidsGalaxyDesignProjectionMode,
    strokeCount: m.userData.kidsGalaxyEmbossedStrokeCount,
    background: p.mesh.userData.kidsGalaxyManifestBackground,
    width: image.width,
    height: image.height,
    colour: read(image),
    relief: read(relief),
    displacementScale: m.displacementScale,
  };
}
"""


def close(pixel, target, tolerance=45):
    return sum((int(pixel[i]) - target[i]) ** 2 for i in range(3)) <= tolerance**2


def pixel(state, x, y):
    offset = (y * state["width"] + x) * 4
    return state["colour"][offset : offset + 3]


def row_fraction(state, y, target):
    hits = sum(close(pixel(state, x, y), target) for x in range(state["width"]))
    return hits / state["width"]


def main() -> int:
    with Server() as server:
        planet_id = upload_manifest_planet(server)
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
                "?.mesh?.material?.userData?.kidsGalaxyManifestStrokeSurface)",
                20_000,
            )
            state = page.evaluate(SURFACE_STATE, planet_id)
            page.screenshot(path="artifacts/manifest-stroke-planet.png")
            browser.close()

    check(state is not None, "manifest surface produced inspectable colour and relief maps")
    if state is None:
        return 1

    print("\nmanifest source of truth")
    check(state["manifest"], "projector loaded the drawing manifest")
    check(state["manifestSurface"], "outermost manifest renderer replaced PNG inference")
    check(
        state["mode"] == "manifest-strokes-embossed-on-body",
        f"diagnostics identify the manifest projection ({state['mode']})",
    )
    check(state["strokeCount"] == 3, f"all authored strokes survive ({state['strokeCount']})")
    check(state["background"] == "#ffffff", "manifest background is the planet base")

    print("\nhorizontal and polar projection")
    check(
        row_fraction(state, 2, PURPLE) > 0.95,
        "a stroke reaching the north edge closes into a full purple pole cap",
    )
    orange_best = max(row_fraction(state, y, ORANGE) for y in range(70, 115))
    check(
        orange_best > 0.88,
        f"a horizontal stroke is stretched around the complete sphere ({orange_best:.0%})",
    )

    print("\nvertical stroke stays a path")
    green_rows = []
    widest_green = 0.0
    for y in range(105, 235):
        fraction = row_fraction(state, y, GREEN)
        if fraction > 0.01:
            green_rows.append(y)
            widest_green = max(widest_green, fraction)
    check(len(green_rows) >= 35, f"vertical stroke follows many latitudes ({len(green_rows)} rows)")
    check(
        widest_green < 0.24,
        f"vertical stroke remains a narrow meridian instead of a belt ({widest_green:.0%})",
    )
    check(
        row_fraction(state, state["height"] - 1, BODY) > 0.95,
        "untouched south pole remains the white base colour",
    )

    print("\nembossing")
    body_level = 36
    relief_values = state["relief"][0::4]
    check(state["displacementScale"] > 0, "manifest paint uses real displacement geometry")
    check(max(relief_values) > body_level + 100, "stroke interiors stand clearly above the body")
    check(not errors, f"browser console remains clean ({errors})")

    if FAILURES:
        print(f"\n{len(FAILURES)} manifest stroke check(s) failed")
        return 1
    print("\nManifest stroke projection checks passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
