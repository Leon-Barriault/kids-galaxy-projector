#!/usr/bin/env python3
"""Real-WebGL acceptance for fill-heavy source-canvas latitude projection."""

from __future__ import annotations

import io
from pathlib import Path

from PIL import Image, ImageDraw
from playwright.sync_api import sync_playwright

from check_projector import FAILURES, Server, check, wait_for

REPO_ROOT = Path(__file__).resolve().parent.parent
ARTIFACT_DIR = REPO_ROOT / "artifacts"


def latitude_band_png() -> bytes:
    """Purple -> orange -> yellow -> green -> white from north to south."""
    image = Image.new("RGB", (256, 256), (255, 255, 255))
    draw = ImageDraw.Draw(image)
    bands = [
        (0, 51, (156, 39, 176)),
        (51, 102, (255, 152, 0)),
        (102, 154, (255, 235, 59)),
        (154, 205, (76, 175, 80)),
        (205, 256, (255, 255, 255)),
    ]
    for top, bottom, colour in bands:
        draw.rectangle((0, top, 255, bottom - 1), fill=colour)
    output = io.BytesIO()
    image.save(output, format="PNG")
    return output.getvalue()


def main() -> int:
    FAILURES.clear()
    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)

    with Server() as server, sync_playwright() as pw:
        planet_id = server.upload(
            "Latitude Bands",
            artwork=latitude_band_png(),
            style="classic",
            body_color="#ffffff",
        )

        browser = pw.chromium.launch(
            args=["--use-gl=swiftshader", "--enable-unsafe-swiftshader"]
        )
        page = browser.new_page(viewport={"width": 1000, "height": 1000})
        errors: list[str] = []
        page.on(
            "console",
            lambda message: errors.append(message.text) if message.type == "error" else None,
        )
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto(f"{server.base}/", wait_until="load")
        wait_for(
            page,
            f"Boolean(window.kidsGalaxy?.kidPlanets?.get('{planet_id}')?.mesh?.material?.userData?.kidsGalaxySourceCanvasAreaFill)",
            12_000,
        )

        result = page.evaluate(
            f"""
            (() => {{
              const entity = window.kidsGalaxy.kidPlanets.get('{planet_id}');
              const data = entity.mesh.material.userData;
              const group = entity.areaFillProjectionGroup;
              const mesh = group?.children?.[0];
              const geometry = mesh?.geometry;
              const positions = geometry?.getAttribute?.('position');
              const colours = geometry?.getAttribute?.('color');
              const uvs = geometry?.getAttribute?.('uv');
              const zones = {{ purple: 0, orange: 0, yellow: 0, green: 0 }};
              let blueDominant = 0;
              let minimumLatitude = 90;
              let maximumLatitude = -90;
              let minimumPaintV = 1;
              let maximumPaintV = 0;

              for (let index = 0; index < (positions?.count || 0); index += 4) {{
                const v = (
                  uvs.getY(index) +
                  uvs.getY(index + 1) +
                  uvs.getY(index + 2) +
                  uvs.getY(index + 3)
                ) / 4;
                const r = colours.getX(index);
                const g = colours.getY(index);
                const b = colours.getZ(index);
                minimumPaintV = Math.min(minimumPaintV, v);
                maximumPaintV = Math.max(maximumPaintV, v);
                if (v < 0.2) zones.purple += 1;
                else if (v < 0.4) zones.orange += 1;
                else if (v < 0.6) zones.yellow += 1;
                else if (v < 0.81) zones.green += 1;
                if (b > r * 1.1 && b > g * 1.1) blueDominant += 1;

                for (let offset = 0; offset < 4; offset += 1) {{
                  const vertex = index + offset;
                  const radius = Math.hypot(
                    positions.getX(vertex),
                    positions.getY(vertex),
                    positions.getZ(vertex),
                  ) || 1;
                  const latitude = Math.asin(positions.getY(vertex) / radius) * 180 / Math.PI;
                  minimumLatitude = Math.min(minimumLatitude, latitude);
                  maximumLatitude = Math.max(maximumLatitude, latitude);
                }}
              }}

              return {{
                active: Boolean(data.kidsGalaxySourceCanvasAreaFill),
                mode: data.kidsGalaxyStrokeProjectionMode,
                latitudeDegrees: data.kidsGalaxyStrokeLatitudeDegrees,
                wrapDegrees: data.kidsGalaxyStrokeWrapDegrees,
                bodyHex: '#' + entity.mesh.material.color.getHexString(),
                coverage: data.kidsGalaxyAreaFillCoverage,
                broadRows: data.kidsGalaxyAreaFillBroadRows,
                oldSculptedHidden: entity.sculptedArtworkGroup?.visible === false,
                quadCount: geometry?.userData?.kidsGalaxySourceCanvasQuadCount || 0,
                minimumLatitude,
                maximumLatitude,
                minimumPaintV,
                maximumPaintV,
                zones,
                blueDominant,
              }};
            }})()
            """
        )

        check(result["active"], "fill-heavy drawing selects source-canvas projection")
        check(result["mode"] == "source-canvas-area-fill-480x180", "projection records the source-faithful mode")
        check(result["latitudeDegrees"] == 180, "canvas Y spans the full 180 degrees of latitude")
        check(result["wrapDegrees"] == 480, "canvas X retains the 480-degree longitudinal winding")
        check(result["bodyHex"].lower() == "#ffffff", "unpainted south-pole body remains white")
        check(result["coverage"] > 0.7, "large filled regions are detected from actual source coverage")
        check(result["oldSculptedHidden"], "blob-style sculpted component group is hidden for filled artwork")
        check(result["quadCount"] > 5_000, "filled artwork is densely tessellated instead of contour-triangulated")
        check(result["maximumLatitude"] >= 89.0, "purple source top reaches the north pole")
        check(-57.0 <= result["minimumLatitude"] <= -52.0, "green ends near its authored latitude, leaving white toward the south pole")
        check(result["minimumPaintV"] < 0.01, "paint starts at the literal source top")
        check(0.78 <= result["maximumPaintV"] <= 0.81, "paint stops before the literal white source bottom")
        check(all(result["zones"][name] > 1_000 for name in ("purple", "orange", "yellow", "green")), "all four authored colour bands survive in source order")
        check(result["blueDominant"] == 0, "projection cannot invent a blue region absent from the source")

        page.evaluate(
            f"""
            (() => {{
              const kg = window.kidsGalaxy;
              const entity = kg.kidPlanets.get('{planet_id}');
              const galaxy = kg.engine.galaxyScene;
              const camera = kg.engine.cameraController;
              kg.scene.background.setHex(0xf7f6f3);
              kg.scene.fog = null;
              galaxy.stars.visible = false;
              galaxy.companions.forEach((record) => {{ record.mesh.visible = false; }});
              galaxy.sunGroup.children.forEach((child) => {{ if (child.isMesh) child.visible = false; }});
              galaxy.sunLight.visible = true;
              galaxy.sunLight.position.set(3.7, 4.5, 5.6);
              galaxy.sunLight.intensity = 2.4;
              galaxy.sunLight.decay = 0;
              galaxy.ambientLight.visible = true;
              galaxy.ambientLight.intensity = 0.5;
              galaxy.fillLight.visible = true;
              galaxy.fillLight.intensity = 0.36;
              kg.kidPlanets.forEach((planet) => {{
                planet.mesh.visible = planet === entity;
                planet.ring.visible = false;
                planet.decorations.forEach((item) => {{ item.visible = false; }});
                planet.companions.forEach((item) => {{ item.object.visible = false; }});
              }});
              entity.mesh.position.set(0, 0, 0);
              entity.mesh.scale.setScalar(1.55);
              entity.mesh.rotation.set(0, 0, 0);
              entity.update = () => entity.mesh.position.set(0, 0, 0);
              camera.controls.autoRotate = false;
              camera.controls.enabled = false;
              camera.camera.position.set(0, 0.1, 4.2);
              camera.camera.lookAt(0, 0, 0);
              camera.camera.updateProjectionMatrix();
            }})()
            """
        )
        page.wait_for_timeout(700)
        page.locator("canvas").screenshot(path=str(ARTIFACT_DIR / "latitude-bands-source-faithful.png"))
        check(not errors, f"latitude-band projector run has no browser console errors ({errors[:3]})")
        browser.close()

    if FAILURES:
        print(f"\n{len(FAILURES)} area-fill latitude check(s) failed:")
        for failure in FAILURES:
            print(f"  - {failure}")
        return 1
    print("\nsource-faithful area-fill latitude acceptance passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
