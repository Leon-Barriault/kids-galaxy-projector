#!/usr/bin/env python3
"""Real-WebGL contract for the front-view planet rendering and its live switch.

The manager tablet can switch the wall between the classic rendering (canvas
read as a world map, ribbons, polar twist) and front-view (the disc the child
painted in is the face of the planet, its mirror image the back). This checks
both halves: that front-view keeps marks where they were drawn, and that the
switch rebuilds a planet in place - same orbit, no arrival celebration - and
back again.
"""

from __future__ import annotations

# Checked before the third-party imports below, so a missing Playwright or
# Pillow reports one install command instead of a bare ModuleNotFoundError.
from _projector_deps import require as _require_projector_dependencies

_require_projector_dependencies()

import io
import json
import math

import httpx
from PIL import Image
from playwright.sync_api import sync_playwright

from check_projector import FAILURES, Server, check, chromium_executable, wait_for

CANVAS_W = 1700
CANVAS_H = 1000
GUIDE = 0.42
RIM_EASE = 0.3

BODY = (30, 136, 229)
RED = (229, 57, 53)
BLACK = (33, 33, 33)
YELLOW = (253, 216, 53)


def disc_to_canvas(x: float, y: float) -> list[float]:
    radius = GUIDE * min(CANVAS_W, CANVAS_H)
    return [0.5 + x * radius / CANVAS_W, 0.5 + y * radius / CANVAS_H]


def width_normalized(disc_radii: float) -> float:
    return disc_radii * GUIDE


def manifest_bytes() -> bytes:
    spot = []
    for row in range(5):
        y = -0.37 + row * 0.02
        spot += [disc_to_canvas(0.48, y), disc_to_canvas(0.56, y)]
    smile = [
        disc_to_canvas(0.06 + 0.2 * math.cos(a), -0.02 + 0.2 * math.sin(a))
        for a in [math.pi * (0.18 + 0.04 * i) for i in range(17)]
    ]
    stripe = [disc_to_canvas(-1.05 + 0.07 * i, 0.34) for i in range(31)]
    return json.dumps(
        {
            "version": 1,
            "coordinate_space": "normalized-canvas-v1",
            "canvas": {"width": CANVAS_W, "height": CANVAS_H},
            "background_color": "#1e88e5",
            "background_explicit": True,
            "strokes": [
                {
                    "stroke_id": "red-spot",
                    "order": 0,
                    "color": "#e53935",
                    "width_px": 30,
                    "width_normalized": width_normalized(0.07),
                    "points": spot,
                },
                {
                    "stroke_id": "smile",
                    "order": 1,
                    "color": "#212121",
                    "width_px": 21,
                    "width_normalized": width_normalized(0.05),
                    "points": smile,
                },
                {
                    "stroke_id": "stripe",
                    "order": 2,
                    "color": "#fdd835",
                    "width_px": 46,
                    "width_normalized": width_normalized(0.11),
                    "points": stripe,
                },
            ],
        }
    ).encode()


def blank_png() -> bytes:
    output = io.BytesIO()
    Image.new("RGB", (512, 512), BODY).save(output, format="PNG")
    return output.getvalue()


def upload(server: Server) -> str:
    response = httpx.post(
        f"{server.base}/api/upload",
        files={
            "file": ("drawing.png", blank_png(), "image/png"),
            "manifest": ("drawing-manifest.json", manifest_bytes(), "application/json"),
        },
        data={"name": "Front View", "body_color": "#1e88e5"},
        timeout=10,
    )
    response.raise_for_status()
    return response.json()["planet_id"]


def disc_point_for_texel(u: float, v: float) -> tuple[float, float]:
    """Same arithmetic as FrontViewProjection.discPointForTexel."""
    phi = u * 2 * math.pi
    theta = v * math.pi
    x = -math.cos(phi) * math.sin(theta)
    y = math.cos(theta)
    r = math.hypot(x, y)
    if r < 1e-9:
        return 0.0, 0.0
    alpha = math.asin(min(1.0, r))
    rho = (1 - RIM_EASE) * min(1.0, r) + RIM_EASE * (alpha / (math.pi / 2))
    return x / r * rho, -y / r * rho


STATE = """
(id) => {
  const p = window.kidsGalaxy.kidPlanets.get(id);
  if (!p?.mesh?.material?.userData?.kidsGalaxyManifestStrokeSurface) return null;
  const m = p.mesh.material;
  const image = m.map.image;
  const c = document.createElement('canvas');
  c.width = image.width; c.height = image.height;
  const ctx = c.getContext('2d', { alpha: false, willReadFrequently: true });
  ctx.drawImage(image, 0, 0);
  return {
    rendering: m.userData.kidsGalaxyPlanetRendering,
    mode: m.userData.kidsGalaxyDesignProjectionMode,
    twisted: Boolean(p.mesh.geometry.userData?.kidsGalaxyPolarMagnetSweep3D),
    beveled: Boolean(p.mesh.geometry.userData?.kidsGalaxyBeveledRelief),
    strokeCount: m.userData.kidsGalaxyEmbossedStrokeCount,
    scale: p.mesh.scale.x,
    orbit: [p.a, p.e, p.i, p.M0],
    loaderRendering: window.kidsGalaxy.engine.planetLoader.planetRendering,
    width: image.width,
    height: image.height,
    colour: Array.from(ctx.getImageData(0, 0, image.width, image.height).data),
  };
}
"""


def close(pixel, target, tolerance=48):
    return sum((int(pixel[i]) - target[i]) ** 2 for i in range(3)) <= tolerance**2


def pixel(state, u, v):
    offset = (v * state["width"] + u) * 4
    return state["colour"][offset : offset + 3]


def widest_row(state, target) -> int:
    return max(
        sum(1 for u in range(state["width"]) if close(pixel(state, u, v), target))
        for v in range(state["height"])
    )


def main() -> int:
    FAILURES.clear()
    with Server() as server:
        planet_id = upload(server)
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
            classic = page.evaluate(STATE, planet_id)

            server.update_behavior(planet_rendering="front-view")
            wait_for(
                page,
                f"window.kidsGalaxy.kidPlanets.get('{planet_id}')?.mesh?.material?.userData"
                "?.kidsGalaxyPlanetRendering === 'front-view'",
                20_000,
            )
            front = page.evaluate(STATE, planet_id)
            page.screenshot(path="artifacts/front-view-planet.png")

            server.update_behavior(planet_rendering="classic")
            wait_for(
                page,
                f"window.kidsGalaxy.kidPlanets.get('{planet_id}')?.mesh?.material?.userData"
                "?.kidsGalaxyPlanetRendering === 'classic'",
                20_000,
            )
            back_to_classic = page.evaluate(STATE, planet_id)
            browser.close()

    check(classic is not None and front is not None, "both renderings produced inspectable maps")
    if classic is None or front is None:
        return 1

    print("\nclassic stays the default")
    check(
        classic["rendering"] == "classic", f"a fresh wall renders classic ({classic['rendering']})"
    )
    check(
        classic["mode"] == "manifest-strokes-layered-on-body",
        "classic keeps the stable manifest projection contract",
    )
    check(classic["twisted"], "classic still applies the polar twist")

    print("\nfront-view")
    check(front["loaderRendering"] == "front-view", "the switch reached the planet loader")
    check(
        front["mode"] == "manifest-front-view-mirrored",
        f"diagnostics name the projection ({front['mode']})",
    )
    check(not front["twisted"], "front-view planets are not twisted")
    check(front["beveled"], "front-view paint is still raised as beveled geometry")
    check(front["strokeCount"] == 3, f"every authored stroke survives ({front['strokeCount']})")

    width, height = front["width"], front["height"]
    best = min(
        ((u, v) for v in range(height) for u in range(width // 2)),
        key=lambda texel: math.hypot(
            disc_point_for_texel((texel[0] + 0.5) / width, (texel[1] + 0.5) / height)[0] - 0.52,
            disc_point_for_texel((texel[0] + 0.5) / width, (texel[1] + 0.5) / height)[1] + 0.33,
        ),
    )
    check(close(pixel(front, *best), RED), f"the red spot sits where it was drawn (texel {best})")
    check(
        close(pixel(front, width - 1 - best[0], best[1]), RED),
        "its mirror image covers the far side",
    )
    check(
        widest_row(front, BLACK) < width * 0.4,
        f"the smile stays a smile ({widest_row(front, BLACK)} of {width} texels in its widest row)",
    )
    check(
        widest_row(front, YELLOW) > width * 0.95,
        "a stripe drawn across the whole disc closes into a ring",
    )

    print("\nlive switch")
    check(front["orbit"] == classic["orbit"], "the rebuilt planet keeps its orbit")
    check(front["scale"] == 1, "the rebuild does not replay the arrival scale-in")
    check(back_to_classic["rendering"] == "classic", "switching back restores classic")
    check(back_to_classic["twisted"], "and with it the polar twist")
    check(not errors, f"browser console remains clean ({errors})")

    if FAILURES:
        print(f"\n{len(FAILURES)} front-view check(s) failed")
        return 1
    print("\nFront-view rendering checks passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
