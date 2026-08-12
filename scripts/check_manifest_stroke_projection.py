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
                    "stroke_id": "purple-cap",
                    "order": 0,
                    "color": "#7b1fa2",
                    "width_px": 48,
                    "width_normalized": 0.09375,
                    # Deliberately does not touch y=0. It is merely the nearest
                    # broad stroke to the north and should still claim the pole.
                    "points": [[0.12, 0.14], [0.5, 0.16], [0.88, 0.145]],
                },
                {
                    "stroke_id": "orange-wide-early",
                    "order": 1,
                    "color": "#f57c00",
                    "width_px": 38,
                    "width_normalized": 0.07421875,
                    "points": [[0.28, 0.29], [0.5, 0.33], [0.72, 0.30]],
                },
                {
                    "stroke_id": "orange-narrow-late",
                    "order": 2,
                    "color": "#f57c00",
                    "width_px": 25,
                    "width_normalized": 0.048828125,
                    # Same paint colour as the previous stroke, intentionally
                    # overlapping its lower edge. Identity, not RGB, must create
                    # a second relief terrace and a shoulder between them.
                    "points": [[0.22, 0.365], [0.52, 0.385], [0.78, 0.37]],
                },
                {
                    "stroke_id": "green-band",
                    "order": 3,
                    "color": "#43a047",
                    "width_px": 36,
                    "width_normalized": 0.0703125,
                    "points": [[0.2, 0.47], [0.48, 0.49], [0.8, 0.46]],
                },
                {
                    "stroke_id": "blue-band",
                    "order": 4,
                    "color": "#1e88e5",
                    "width_px": 34,
                    "width_normalized": 0.06640625,
                    "points": [[0.25, 0.57], [0.5, 0.59], [0.75, 0.56]],
                },
                {
                    "stroke_id": "pink-band",
                    "order": 5,
                    "color": "#d81b60",
                    "width_px": 34,
                    "width_normalized": 0.06640625,
                    "points": [[0.2, 0.69], [0.5, 0.71], [0.8, 0.68]],
                },
                {
                    "stroke_id": "white-meridian",
                    "order": 6,
                    "color": "#ffffff",
                    "width_px": 24,
                    "width_normalized": 0.046875,
                    # Tall stroke remains a local meridian path rather than a
                    # latitude band. Keep it below the coloured layers so the
                    # full-revolution assertions are not measuring later-paint occlusion.
                    "points": [[0.49, 0.79], [0.52, 0.86], [0.5, 0.94]],
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
    strokeProfiles: m.userData.kidsGalaxyEmbossStrokeProfiles,
    heightHeuristic: m.userData.kidsGalaxyEmbossHeightHeuristic,
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


def relief_row_mean(state, y):
    start = y * state["width"] * 4
    end = start + state["width"] * 4
    return sum(state["relief"][start:end:4]) / state["width"]


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
    check(state["strokeCount"] == 7, f"all authored strokes survive ({state['strokeCount']})")
    check(state["background"] == "#000000", "manifest background is the planet base")

    print("\nfull-revolution latitude layers and polar ownership")
    check(state["northPoleStroke"] == 0, "nearest broad top stroke owns the north pole")
    check(
        row_fraction(state, 2, PURPLE) > 0.98,
        "the nearest purple stroke closes into a complete north-pole cap",
    )
    band_checks = [
        (ORANGE, 60, 88, "first orange"),
        (ORANGE, 88, 108, "second same-color orange"),
        (GREEN, 105, 135, "green"),
        (BLUE, 135, 165, "blue"),
        (PINK, 165, 200, "pink"),
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
    for y in range(195, 252):
        fraction = row_fraction(state, y, WHITE)
        if fraction > 0.005:
            white_rows.append(y)
            widest_white = max(widest_white, fraction)
    check(len(white_rows) >= 30, f"vertical stroke follows many latitudes ({len(white_rows)} rows)")
    check(
        widest_white < 0.18,
        f"vertical stroke remains a narrow meridian instead of a belt ({widest_white:.0%})",
    )
    check(
        row_fraction(state, state["height"] - 1, BODY) > 0.95,
        "untouched south pole remains the black base colour",
    )

    print("\nper-stroke mixed embossing")
    levels = state["layerLevels"] or []
    profiles = state["strokeProfiles"] or []
    rounded_levels = {round(float(level), 6) for level in levels}
    check(len(levels) == 7, f"each stroke receives an emboss level ({len(levels)})")
    check(
        len(rounded_levels) == 7,
        f"every authored stroke has a unique physical height ({levels})",
    )
    check(
        state["heightHeuristic"] == "order35-width25-coverage20-pole10-jitter10",
        f"renderer reports the approved mixed height heuristic ({state['heightHeuristic']})",
    )
    profile_ids = [profile.get("strokeId") for profile in profiles]
    check(len(set(profile_ids)) == 7, f"stroke identities remain unique ({profile_ids})")
    orange_profiles = [profile for profile in profiles if profile.get("colour") == "#f57c00"]
    check(len(orange_profiles) == 2, "two authored orange strokes remain separate profiles")
    if len(orange_profiles) == 2:
        orange_delta = abs(float(orange_profiles[0]["level"]) - float(orange_profiles[1]["level"]))
        check(
            orange_profiles[0]["strokeId"] != orange_profiles[1]["strokeId"],
            "same-color strokes preserve independent identities",
        )
        check(
            orange_delta >= 0.01,
            f"same-color strokes receive visibly different heights (delta {orange_delta:.3f})",
        )
        check(
            orange_profiles[0]["components"]["jitter"]
            != orange_profiles[1]["components"]["jitter"],
            "deterministic stroke-id jitter separates otherwise similar strokes",
        )

    # The two orange bands overlap in source Y. Since ownership is by stroke ID,
    # their shared RGB boundary must still form a physical shoulder in the height map.
    orange_boundary = min(relief_row_mean(state, y) for y in range(84, 91))
    orange_centres = [relief_row_mean(state, 75), relief_row_mean(state, 98)]
    check(
        orange_boundary + 18 < min(orange_centres),
        (
            "touching same-color strokes retain a visible emboss shoulder "
            f"({orange_centres[0]:.0f}/{orange_boundary:.0f}/{orange_centres[1]:.0f})"
        ),
    )
    check(
        max(levels) - min(levels) >= 0.06,
        f"mixed per-stroke relief still has meaningful height spread ({min(levels):.2f}-{max(levels):.2f})",
    )

    body_level = 36
    relief_values = state["relief"][0::4]
    check(state["displacementScale"] >= 0.1, "manifest paint uses stronger real displacement geometry")
    check(state["bumpScale"] >= 0.14, "rounded layer shoulders have visible surface emboss")
    check(max(relief_values) > body_level + 130, "highest stroke layer stands clearly above the body")
    check(not errors, f"browser console remains clean ({errors})")

    if FAILURES:
        print(f"\n{len(FAILURES)} manifest stroke check(s) failed")
        return 1
    print("\nManifest stroke projection checks passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
