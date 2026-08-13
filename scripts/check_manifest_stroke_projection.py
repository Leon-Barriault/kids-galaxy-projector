#!/usr/bin/env python3
"""Real-WebGL contract for manifest-authored molded planet relief."""

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
                    "width_px": 54,
                    "width_normalized": 0.105,
                    "points": [[0.12, 0.14], [0.5, 0.17], [0.88, 0.145]],
                },
                {
                    "stroke_id": "orange-wide-early",
                    "order": 1,
                    "color": "#f57c00",
                    "width_px": 44,
                    "width_normalized": 0.086,
                    "points": [[0.16, 0.29], [0.38, 0.34], [0.62, 0.30], [0.84, 0.325]],
                },
                {
                    "stroke_id": "orange-narrow-late",
                    "order": 2,
                    "color": "#f57c00",
                    "width_px": 29,
                    "width_normalized": 0.057,
                    "points": [[0.18, 0.39], [0.42, 0.36], [0.66, 0.405], [0.82, 0.38]],
                },
                {
                    "stroke_id": "green-band",
                    "order": 3,
                    "color": "#43a047",
                    "width_px": 42,
                    "width_normalized": 0.082,
                    "points": [[0.12, 0.68], [0.36, 0.63], [0.65, 0.70], [0.88, 0.66]],
                },
                {
                    "stroke_id": "white-meridian",
                    "order": 4,
                    "color": "#ffffff",
                    "width_px": 24,
                    "width_normalized": 0.047,
                    "points": [[0.49, 0.74], [0.52, 0.84], [0.5, 0.94]],
                },
            ],
        }
    ).encode()


def upload_manifest_planet(server: Server) -> str:
    response = httpx.post(
        f"{server.base}/api/upload",
        files={
            "file": ("blank.png", blank_png(), "image/png"),
            "manifest": ("drawing-manifest.json", manifest_bytes(), "application/json"),
        },
        data={"name": "Manifest Molded Relief", "body_color": "#000000"},
        timeout=10,
    )
    response.raise_for_status()
    return response.json()["planet_id"]


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
    mode: m.userData.kidsGalaxyDesignProjectionMode,
    strokeCount: m.userData.kidsGalaxyEmbossedStrokeCount,
    internalGapFillTexels: m.userData.kidsGalaxyInternalGapFillTexels,
    internalGapFillWidestRun: m.userData.kidsGalaxyInternalGapFillWidestRun,
    internalGapFillVersion: m.userData.kidsGalaxyInternalGapFillVersion,
    layerLevels: m.userData.kidsGalaxyEmbossLayerLevels,
    strokeProfiles: m.userData.kidsGalaxyEmbossStrokeProfiles,
    northPoleStroke: m.userData.kidsGalaxyNorthPoleStroke,
    width: image.width,
    height: image.height,
    colour: read(image),
    relief: read(relief),
    displacementScale: m.displacementScale,
    bumpScale: m.bumpScale,
  };
}
"""


def close(pixel_value, target, tolerance=48):
    return sum((int(pixel_value[i]) - target[i]) ** 2 for i in range(3)) <= tolerance**2


def pixel(state, x, y):
    offset = (y * state["width"] + x) * 4
    return state["colour"][offset : offset + 3]


def colour_rows_at_x(state, x, target):
    return [y for y in range(state["height"]) if close(pixel(state, x, y), target)]


def main() -> int:
    FAILURES.clear()
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

    check(
        state["mode"] == "manifest-strokes-layered-on-body",
        f"renderer keeps the stable manifest projection contract ({state['mode']})",
    )
    check(state["strokeCount"] == 5, f"all authored strokes survive ({state['strokeCount']})")
    check(state["northPoleStroke"] == 0, "nearest broad top stroke owns the north pole")
    check(close(pixel(state, 2, 2), PURPLE), "purple top stroke closes the north cap")

    print("\nbackground handling")
    check(
        state["internalGapFillVersion"] == 2,
        f"wide-gap filler v2 is active ({state['internalGapFillVersion']})",
    )
    check(
        (state["internalGapFillTexels"] or 0) > 0,
        f"internal background gaps are bridged ({state['internalGapFillTexels']})",
    )
    check(
        (state["internalGapFillWidestRun"] or 0) > state["height"] * 0.16,
        f"a real wide internal gap is bridged ({state['internalGapFillWidestRun']} texels)",
    )
    check(
        not close(pixel(state, 256, 132), BODY, tolerance=24),
        "wide background between adjacent wrapped paint bands is not exposed",
    )
    check(
        close(pixel(state, 256, state["height"] - 2), BODY, tolerance=24),
        "background below the final wrapped paint band remains intentional body colour",
    )

    print("\nperiodic wrapped ribbons")
    for target, name in [(ORANGE, "orange"), (GREEN, "green")]:
        left_rows = colour_rows_at_x(state, 1, target)
        right_rows = colour_rows_at_x(state, state["width"] - 2, target)
        check(left_rows and right_rows, f"{name} ribbon reaches both longitude seam edges")
        if left_rows and right_rows:
            left_mid = sum(left_rows) / len(left_rows)
            right_mid = sum(right_rows) / len(right_rows)
            check(
                abs(left_mid - right_mid) <= 3.0,
                f"{name} closes smoothly at the longitude seam ({left_mid:.1f}/{right_mid:.1f})",
            )

    green_centres = []
    for x in [32, 128, 256, 384, 480]:
        rows = colour_rows_at_x(state, x, GREEN)
        check(rows, f"green molded ribbon exists at longitude texel {x}")
        if rows:
            green_centres.append(sum(rows) / len(rows))
    check(
        green_centres and max(green_centres) - min(green_centres) >= 4,
        f"wrapped ribbon preserves organic waviness ({green_centres})",
    )

    print("\nphysical molded relief")
    levels = state["layerLevels"] or []
    profiles = state["strokeProfiles"] or []
    check(len(levels) == 5, "each stroke receives an independent relief profile")
    check(len({round(float(level), 6) for level in levels}) == 5, "stroke heights remain distinct")
    orange_profiles = [profile for profile in profiles if profile.get("colour") == "#f57c00"]
    check(len(orange_profiles) == 2, "same-colour orange strokes remain separate physical layers")
    if len(orange_profiles) == 2:
        check(
            abs(float(orange_profiles[0]["level"]) - float(orange_profiles[1]["level"])) >= 0.015,
            "same-colour strokes have visibly different molded heights",
        )

    relief_values = state["relief"][0::4]
    check(state["displacementScale"] >= 0.14, "paint uses strong geometry displacement")
    check(state["bumpScale"] >= 0.2, "rounded shoulders use strong local surface relief")
    check(max(relief_values) - min(relief_values) > 150, "relief map has toy-like physical depth")

    white_columns = 0
    for x in range(state["width"]):
        if any(close(pixel(state, x, y), WHITE) for y in range(180, 250)):
            white_columns += 1
    check(white_columns < state["width"] * 0.2, "vertical stroke remains a localized meridian")
    check(not errors, f"browser console remains clean ({errors})")

    if FAILURES:
        print(f"\n{len(FAILURES)} manifest stroke check(s) failed")
        return 1
    print("\nManifest molded relief checks passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
