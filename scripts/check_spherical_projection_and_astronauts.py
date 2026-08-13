#!/usr/bin/env python3
"""Real-WebGL acceptance for spherical stroke mapping and astronaut choices."""

from __future__ import annotations

# Checked before the third-party imports below, so a missing Playwright or
# Pillow reports one install command instead of a bare ModuleNotFoundError.
from _projector_deps import require as _require_projector_dependencies

_require_projector_dependencies()

import io
import sys
from pathlib import Path

from PIL import Image, ImageDraw
from playwright.sync_api import sync_playwright

from check_projector import FAILURES, Server, check, chromium_executable, wait_for

REPO_ROOT = Path(__file__).resolve().parent.parent
ARTIFACTS = REPO_ROOT / "artifacts"


def spherical_artwork() -> bytes:
    body = (45, 146, 205)
    image = Image.new("RGB", (128, 128), body)
    draw = ImageDraw.Draw(image)
    draw.line([(18, 22), (45, 14), (76, 24), (110, 18)], fill=(239, 83, 80), width=12)
    draw.line([(16, 105), (44, 112), (80, 101), (112, 109)], fill=(76, 175, 80), width=11)
    draw.line([(29, 35), (55, 61), (82, 48), (101, 79)], fill=(255, 213, 79), width=9)
    draw.ellipse((56, 52, 74, 70), fill=(255, 255, 255))
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def render_state(page, planet_id: str) -> dict:
    return page.evaluate(
        """
        (id) => {
          const p = window.kidsGalaxy.kidPlanets.get(id);
          const group = p?.sculptedArtworkGroup;
          const patches = (group?.children || []).filter((m) =>
            m.isMesh && m.visible !== false && m.geometry?.userData?.kidsGalaxyStrokeOnlyProjection
          );
          const ys = [];
          const latitudeMins = [];
          const latitudeMaxes = [];
          patches.forEach((mesh) => {
            const attr = mesh.geometry?.getAttribute?.('position');
            if (!attr) return;
            for (let i = 0; i < attr.count; i += 1) {
              const x = attr.getX(i);
              const y = attr.getY(i);
              const z = attr.getZ(i);
              const length = Math.hypot(x, y, z);
              if (length > 0.000001) ys.push(y / length);
            }
            const minLat = mesh.geometry?.userData?.kidsGalaxyStrokeLatitudeMin;
            const maxLat = mesh.geometry?.userData?.kidsGalaxyStrokeLatitudeMax;
            if (Number.isFinite(minLat)) latitudeMins.push(minLat);
            if (Number.isFinite(maxLat)) latitudeMaxes.push(maxLat);
          });

          const astronaut = p?.companions?.find((record) => record.type === 'astronaut')?.object;
          let visorTone = null;
          let visorBrightness = null;
          let visorCount = 0;
          let highlightCount = 0;
          astronaut?.traverse((child) => {
            if (child.userData?.kidsGalaxyAstronautVisorHighlight) highlightCount += 1;
            if (!child.userData?.kidsGalaxyAstronautVisor || !child.material?.color) return;
            visorCount += 1;
            visorTone = child.userData.kidsGalaxyAstronautVisorTone;
            const c = child.material.color;
            visorBrightness = (c.r + c.g + c.b) / 3;
          });

          return {
            wrapDegrees: p?.mesh?.material?.userData?.kidsGalaxyStrokeWrapDegrees || 0,
            latitudeDegrees: group?.userData?.kidsGalaxyStrokeLatitudeDegrees || 0,
            projectionMode: group?.userData?.kidsGalaxyStrokeProjectionMode || null,
            minY: ys.length ? Math.min(...ys) : 0,
            maxY: ys.length ? Math.max(...ys) : 0,
            minLatitude: latitudeMins.length ? Math.min(...latitudeMins) : 0,
            maxLatitude: latitudeMaxes.length ? Math.max(...latitudeMaxes) : 0,
            variantCount: window.kidsGalaxy.astronautVariants?.length || 0,
            astronautVariant: astronaut?.userData?.kidsGalaxyAstronautVariantNumber || 0,
            astronautKey: astronaut?.userData?.kidsGalaxyAstronautVariant || null,
            astronautLabel: astronaut?.userData?.kidsGalaxyAstronautVariantLabel || null,
            astronautAccent: astronaut?.userData?.kidsGalaxyAstronautAccent || null,
            friendly: Boolean(astronaut?.userData?.kidsGalaxyFriendlyAstronaut),
            approvedPixel: Boolean(astronaut?.userData?.kidsGalaxyApprovedPixelAstronaut),
            childCount: astronaut?.children?.length || 0,
            visorCount,
            visorTone,
            visorBrightness,
            highlightCount,
          };
        }
        """,
        planet_id,
    )


def open_variant(browser, server, planet_id: str, query: str) -> tuple[dict, list[str]]:
    page = browser.new_page(viewport={"width": 1920, "height": 1080})
    errors: list[str] = []
    page.on(
        "console",
        lambda message: errors.append(message.text) if message.type == "error" else None,
    )
    page.on("pageerror", lambda error: errors.append(str(error)))
    suffix = f"?{query}" if query else ""
    page.goto(f"{server.base}/{suffix}", wait_until="load")
    wait_for(page, "window.kidsGalaxy && window.kidsGalaxy.kidPlanets.size === 1", 12_000)
    wait_for(
        page,
        f"window.kidsGalaxy.kidPlanets.get('{planet_id}')?.sculptedArtworkGroup?.userData?.kidsGalaxyStrokeLatitudeProjection === true",
        12_000,
    )
    state = render_state(page, planet_id)
    return state, errors, page


def main() -> int:
    FAILURES.clear()
    ARTIFACTS.mkdir(exist_ok=True)

    with Server() as server, sync_playwright() as pw:
        planet_id = server.upload(
            "Spherical",
            artwork=spherical_artwork(),
            style="classic",
            body_color="#2d92cd",
            companions="astronaut",
        )

        browser = pw.chromium.launch(
            executable_path=chromium_executable(),
            args=["--use-gl=swiftshader", "--enable-unsafe-swiftshader"],
        )

        states: list[dict] = []
        for variant in (1, 2, 3):
            state, errors, page = open_variant(
                browser,
                server,
                planet_id,
                f"astronaut={variant}",
            )
            states.append(state)
            page.screenshot(path=str(ARTIFACTS / f"astronaut-option-{variant}.png"))

            check(state["astronautVariant"] == variant, f"astronaut query selects WebGL option #{variant}")
            check(state["friendly"], f"astronaut option #{variant} carries the kid-friendly model contract")
            check(state["approvedPixel"], f"astronaut option #{variant} uses the approved pixel/chibi treatment")
            check(state["childCount"] >= 18, f"astronaut option #{variant} is a composed blocky 3D model")
            check(state["visorCount"] == 1, f"astronaut option #{variant} exposes one explicit visor")
            check(
                state["visorBrightness"] is not None and state["visorBrightness"] <= 0.18,
                f"astronaut option #{variant} uses the approved dark charcoal visor",
            )
            check(
                state["highlightCount"] >= 4,
                f"astronaut option #{variant} carries white pixel-like visor reflections",
            )
            check(not errors, f"astronaut option #{variant} renders without browser errors")
            page.close()

        print("\nastronaut WebGL comparison")
        check(states[0]["variantCount"] == 3, "projector advertises exactly three astronaut options")
        check(
            len({state["astronautKey"] for state in states}) == 3,
            "the three astronaut choices are distinct model variants",
        )
        check(
            len({state["astronautAccent"] for state in states}) == 3,
            "plain, orange-accent, and blue-jetpack treatments remain distinct",
        )
        check(
            {state["visorTone"] for state in states} == {"charcoal-pixel"},
            "all approved variants share the friendly pixel-art visor treatment",
        )

        random_state, random_errors, random_page = open_variant(browser, server, planet_id, "")
        random_page.close()
        reload_state, reload_errors, reload_page = open_variant(browser, server, planet_id, "")
        reload_page.close()
        check(
            random_state["astronautVariant"] in (1, 2, 3),
            "normal kid flow chooses one of the three approved astronauts",
        )
        check(
            reload_state["astronautVariant"] == random_state["astronautVariant"],
            "per-planet randomized astronaut remains stable across projector reloads",
        )
        check(not random_errors and not reload_errors, "randomized astronaut flow has no browser errors")

        browser.close()

    if FAILURES:
        print(f"\n{len(FAILURES)} spherical/astronaut acceptance check(s) failed")
        return 1
    print("\nSpherical stroke projection and pixel astronaut WebGL options passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
