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

BODY = (0, 0, 0)
PURPLE = (123, 31, 162)
ORANGE = (245, 124, 0)
GREEN = (67, 160, 71)
BLUE = (30, 136, 229)
PINK = (216, 27, 96)
WHITE = (255, 255, 255)


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
            "background_color": "#000000",
            "background_explicit": True,
            "strokes": [
                {
                    "order": 0,
                    "color": "#7b1fa2",
                    "width_px": 48,
                    "width_normalized": 0.09375,
                    # Deliberately does not touch y=0. It is merely the nearest
                    # broad stroke to the north and should still claim the pole.
                    "points": [[0.12, 0.14], [0.5, 0.16], [0.88, 0.145]],
                },
                {
                    "order": 1,
                    "color": "#f57c00",
                    "width_px": 38,
                    "width_normalized": 0.07421875,
                    # A short, slightly wavy stroke must become a complete
                    # longitude band rather than a partial front-side ribbon.
                    "points": [[0.28, 0.29], [0.5, 0.33], [0.72, 0.30]],
                },
                {
                    "order": 2,
                    "color": "#43a047",
                    "width_px": 36,
                    "width_normalized": 0.0703125,
                    "points": [[0.2, 0.43], [0.48, 0.45], [0.8, 0.42]],
                },
                {
                    "order": 3,
                    "color": "#1e88e5",
                    "width_px": 34,
                    "width_normalized": 0.06640625,
                    "points": [[0.25, 0.55], [0.5, 0.57], [0.75, 0.54]],
                },
                {
                    "order": 4,
                    "color": "#d81b60",
                    "width_px": 34,
                    "width_normalized": 0.06640625,
                    "points": [[0.2, 0.68], [0.5, 0.70], [0.8, 0.67]],
                },
                {
                    "order": 5,
                    "color": "#ffffff",
                    "width_px": 24,
                    "width_normalized": 0.046875,
                    # Tall stroke remains a local meridian path rather than a
                    # sixth latitude band.
                    "points": [[0.49, 0.48], [0.52, 0.67], [0.5, 0.86]],
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
        data={"name": "Manifest Strokes", "body_color": "#000000"},
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
    layerLevels: m.userData.kidsGalaxyEmbossLayerLevels,
    northPoleStroke: m.userData.kidsGalaxyNorthPoleStroke,
    background: p.mesh.userData.kidsGalaxyManifestBackground,
    width: image.width,
    height: image.height,
    colour: read(image),
    relief: read(relief),
    displacementScale: m.displacementScale,
    bumpScale: m.bumpScale,
  };
}
"""


def close(pixel_value, target, tolerance=45):
    return sum((int(pixel_value[i]) - target[i]) ** 2 for i in range(3)) <= tolerance**2


def pixel(state, x, y):
    offset = (y * state["width"] + x) * 4
    return state["colour"][offset : offset + 3]


def row_fraction(state, y, target):
    hits = sum(close(pixel(state, x, y), target) for x in range(state["width"]))
    return hits / state["width"]


def best_fraction(state, target, start, end):
    return max(row_fraction(state, y, target) for y in range(start, end))


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
        state["mode"] == "manifest-strokes-layered-on-body",
        f"diagnostics identify the layered manifest projection ({state['mode']})",
    )
    check(state["strokeCount"] == 6, f"all authored strokes survive ({state['strokeCount']})")
    check(state["background"] == "#000000", "manifest background is the planet base")

    print("\nfull-revolution latitude layers and polar ownership")
    check(state["northPoleStroke"] == 0, "nearest broad top stroke owns the north pole")
    check(
        row_fraction(state, 2, PURPLE) > 0.98,
        "the nearest purple stroke closes into a complete north-pole cap",
    )
    band_checks = [
        (ORANGE, 55, 100, "orange"),
        (GREEN, 90, 130, "green"),
        (BLUE, 120, 165, "blue"),
        (PINK, 155, 200, "pink"),
    ]
    for target, start, end, name in band_checks:
        fraction = best_fraction(state, target, start, end)
        check(
            fraction > 0.98,
            f"{name} horizontal stroke makes a complete 360-degree layer ({fraction:.0%})",
        )

    print("\nvertical stroke stays a path")
    white_rows = []
    widest_white = 0.0
    for y in range(105, 235):
        fraction = row_fraction(state, y, WHITE)
        if fraction > 0.005:
            white_rows.append(y)
            widest_white = max(widest_white, fraction)
    check(len(white_rows) >= 35, f"vertical stroke follows many latitudes ({len(white_rows)} rows)")
    check(
        widest_white < 0.18,
        f"vertical stroke remains a narrow meridian instead of a belt ({widest_white:.0%})",
    )
    check(
        row_fraction(state, state["height"] - 1, BODY) > 0.95,
        "untouched south pole remains the black base colour",
    )

    print("\nlayered embossing")
    levels = state["layerLevels"] or []
    rounded_levels = {round(float(level), 3) for level in levels}
    check(len(levels) == 6, f"each stroke receives an emboss level ({len(levels)})")
    check(
        len(rounded_levels) == 6,
        f"adjacent authored layers use distinct physical heights ({levels})",
    )
    check(
        max(levels) - min(levels) >= 0.35,
        f"layer height separation is visually meaningful ({min(levels):.2f}-{max(levels):.2f})",
    )
    body_level = 36
    relief_values = state["relief"][0::4]
    check(state["displacementScale"] >= 0.1, "manifest paint uses stronger real displacement geometry")
    check(state["bumpScale"] >= 0.14, "rounded layer shoulders have visible surface emboss")
    check(max(relief_values) > body_level + 175, "highest stroke layer stands clearly above the body")
    check(not errors, f"browser console remains clean ({errors})")

    if FAILURES:
        print(f"\n{len(FAILURES)} manifest stroke check(s) failed")
        return 1
    print("\nManifest stroke projection checks passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
