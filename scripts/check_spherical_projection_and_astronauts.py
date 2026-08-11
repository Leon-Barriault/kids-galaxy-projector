#!/usr/bin/env python3
"""Real-WebGL acceptance for spherical stroke mapping and astronaut choices."""

from __future__ import annotations

import io
import sys
from pathlib import Path

from PIL import Image, ImageDraw
from playwright.sync_api import sync_playwright

from check_projector import FAILURES, Server, check, wait_for

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
          astronaut?.traverse((child) => {
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
            friendly: Boolean(astronaut?.userData?.kidsGalaxyFriendlyAstronaut),
            childCount: astronaut?.children?.length || 0,
            visorCount,
            visorTone,
            visorBrightness,
          };
        }
        """,
        planet_id,
    )


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
            args=["--use-gl=swiftshader", "--enable-unsafe-swiftshader"]
        )

        states: list[dict] = []
        for variant in (1, 2, 3):
            page = browser.new_page(viewport={"width": 1920, "height": 1080})
            errors: list[str] = []
            page.on(
                "console",
                lambda message: errors.append(message.text) if message.type == "error" else None,
            )
            page.on("pageerror", lambda error: errors.append(str(error)))
            page.goto(f"{server.base}/?astronaut={variant}", wait_until="load")
            wait_for(page, "window.kidsGalaxy && window.kidsGalaxy.kidPlanets.size === 1", 12_000)
            wait_for(
                page,
                f"window.kidsGalaxy.kidPlanets.get('{planet_id}')?.sculptedArtworkGroup?.userData?.kidsGalaxyStrokeLatitudeProjection === true",
                12_000,
            )
            state = render_state(page, planet_id)
            states.append(state)
            page.screenshot(path=str(ARTIFACTS / f"astronaut-option-{variant}.png"))

            check(state["astronautVariant"] == variant, f"astronaut query selects WebGL option #{variant}")
            check(state["friendly"], f"astronaut option #{variant} carries the kid-friendly model contract")
            check(state["childCount"] >= 10, f"astronaut option #{variant} is a composed 3D model")
            check(state["visorCount"] == 1, f"astronaut option #{variant} exposes one explicit visor")
            check(
                state["visorBrightness"] is not None and state["visorBrightness"] >= 0.55,
                f"astronaut option #{variant} uses a bright rather than near-black visor",
            )
            check(not errors, f"astronaut option #{variant} renders without browser errors")
            page.close()

        print("\nspherical stroke projection")
        projection = states[0]
        check(projection["wrapDegrees"] == 480, "X still owns the 480-degree longitudinal winding")
        check(projection["latitudeDegrees"] == 130, "Y is explicitly normalized across 130 degrees of latitude")
        check(
            projection["projectionMode"] == "longitude-480-latitude-130",
            "diagnostics expose combined longitude/latitude projection",
        )
        check(projection["minY"] <= -0.88, "lower authored strokes reach the southern latitudes")
        check(projection["maxY"] >= 0.88, "upper authored strokes reach the northern latitudes")
        check(projection["minLatitude"] <= -63, "geometry records near-target southern latitude")
        check(projection["maxLatitude"] >= 63, "geometry records near-target northern latitude")

        print("\nastronaut WebGL comparison")
        check(states[0]["variantCount"] == 3, "projector advertises exactly three astronaut preview options")
        check(
            len({state["astronautKey"] for state in states}) == 3,
            "the three astronaut choices are distinct model variants",
        )
        check(
            len({state["visorTone"] for state in states}) == 3,
            "the three models use visibly distinct bright visor treatments",
        )

        browser.close()

    if FAILURES:
        print(f"\n{len(FAILURES)} spherical/astronaut acceptance check(s) failed")
        return 1
    print("\nSpherical stroke projection and astronaut WebGL options passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
