#!/usr/bin/env python3
"""Real-WebGL acceptance for tablet bucket/body colour semantics."""

from __future__ import annotations

import io
from pathlib import Path

from PIL import Image, ImageDraw
from playwright.sync_api import sync_playwright

from check_projector import Server, check, wait_for

REPO_ROOT = Path(__file__).resolve().parent.parent
ARTIFACT_DIR = REPO_ROOT / "artifacts"


def white_body_artwork() -> bytes:
    """A deliberately large red trait that old dominant-colour inference loses."""
    image = Image.new("RGB", (256, 256), "white")
    draw = ImageDraw.Draw(image)
    # Broad red authored gesture: deliberately covers well over the old 48%
    # dominant-gesture threshold in the centre of the drawing.
    draw.rounded_rectangle((18, 40, 238, 174), radius=42, fill=(229, 57, 53))
    # Green crossing trait proves a second colour family survives too.
    draw.line(
        [(22, 205), (65, 178), (112, 215), (158, 181), (232, 211)],
        fill=(76, 175, 80),
        width=24,
        joint="curve",
    )
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def main() -> int:
    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)

    with Server() as server, sync_playwright() as pw:
        planet_id = server.upload(
            "White Bucket World",
            artwork=white_body_artwork(),
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
            f"Boolean(window.kidsGalaxy?.kidPlanets?.get('{planet_id}')?.mesh?.material?.userData?.kidsGalaxyExplicitBodyArtwork)",
            12_000,
        )

        scene_payload = __import__("httpx").get(
            f"{server.base}/api/scene",
            timeout=10,
        ).json()
        stored = next(item for item in scene_payload["planets"] if item["id"] == planet_id)
        check(stored.get("body_color") == "#ffffff", "server persists explicit white body colour")

        result = page.evaluate(
            f"""
            (() => {{
              const entity = window.kidsGalaxy.kidPlanets.get('{planet_id}');
              const material = entity.mesh.material;
              const group = entity.sculptedArtworkGroup;
              const front = (group?.children || []).filter(
                (mesh) => mesh.userData?.kidsGalaxyExplicitBodyPatch &&
                  !mesh.userData?.kidsGalaxyBackDesignEcho
              );
              const averages = front.map((mesh) => {{
                const colours = mesh.geometry?.getAttribute('color');
                const result = {{ r: 0, g: 0, b: 0 }};
                if (!colours?.count) return result;
                const stride = Math.max(1, Math.floor(colours.count / 64));
                let samples = 0;
                for (let i = 0; i < colours.count; i += stride) {{
                  result.r += colours.getX(i);
                  result.g += colours.getY(i);
                  result.b += colours.getZ(i);
                  samples += 1;
                }}
                result.r /= Math.max(1, samples);
                result.g /= Math.max(1, samples);
                result.b /= Math.max(1, samples);
                return result;
              }});

              let minX = Infinity;
              let maxX = -Infinity;
              let minY = Infinity;
              let maxY = -Infinity;
              front.forEach((mesh) => {{
                const position = mesh.geometry?.getAttribute('position');
                if (!position) return;
                for (let i = 0; i < position.count; i += 1) {{
                  const x = position.getX(i);
                  const y = position.getY(i);
                  const z = position.getZ(i);
                  const radius = Math.max(0.001, Math.hypot(x, y, z));
                  minX = Math.min(minX, x / radius);
                  maxX = Math.max(maxX, x / radius);
                  minY = Math.min(minY, y / radius);
                  maxY = Math.max(maxY, y / radius);
                }}
              }});

              return {{
                body: [material.color.r, material.color.g, material.color.b],
                source: material.userData?.kidsGalaxyBodyColorSource,
                inferenceDisabled: Boolean(material.userData?.kidsGalaxyBodyColorInferenceDisabled),
                explicitArtwork: Boolean(group?.userData?.kidsGalaxyExplicitBodyArtwork),
                projection: material.userData?.designProjection,
                frontCount: front.length,
                backCount: (group?.children || []).filter(
                  (mesh) => mesh.userData?.kidsGalaxyBackDesignEcho
                ).length,
                hasRed: averages.some((c) => c.r > c.g * 1.7 && c.r > c.b * 1.7),
                hasGreen: averages.some((c) => c.g > c.r * 1.35 && c.g > c.b * 1.25),
                spanX: Number.isFinite(minX) ? maxX - minX : 0,
                spanY: Number.isFinite(minY) ? maxY - minY : 0,
                cleanBody: !material.map && !material.bumpMap && !material.displacementMap,
                rounded: front.every((mesh) => mesh.geometry?.userData?.kidsGalaxyRoundedSlab),
              }};
            }})()
            """
        )

        check(
            min(result["body"]) >= 0.985,
            "white bucket produces an actually white planet body",
        )
        check(result["source"] == "tablet-background", "tablet background is body authority")
        check(result["inferenceDisabled"], "dominant-colour body inference is disabled")
        check(result["explicitArtwork"], "new tablet uses body-aware artwork extraction")
        check(
            result["projection"] == "explicit-body-preserved-kid-traits-across-planet",
            "explicit body path records the no-guesswork projection contract",
        )
        check(result["frontCount"] >= 2, "large red and green traits both survive as front geometry")
        check(result["backCount"] >= result["frontCount"], "authored traits continue around far hemisphere")
        check(result["hasRed"], "large red trait is preserved instead of becoming inferred body")
        check(result["hasGreen"], "green child trait keeps its selected colour")
        check(result["spanX"] >= 1.55, "authored traits span most of planet width")
        check(result["spanY"] >= 1.55, "authored traits span most of planet height")
        check(result["cleanBody"], "body remains clean rather than receiving a literal texture")
        check(result["rounded"], "explicit-body traits are rounded molded geometry")

        page.evaluate(
            f"""
            (() => {{
              const kg = window.kidsGalaxy;
              const entity = kg.kidPlanets.get('{planet_id}');
              kg.scene.background.setHex(0xf7f6f3);
              kg.scene.fog = null;
              kg.engine.galaxyScene.stars.visible = false;
              kg.kidPlanets.forEach((planet) => {{
                planet.mesh.visible = planet === entity;
                planet.decorations.forEach((item) => item.visible = false);
                planet.companions.forEach((item) => item.object.visible = false);
              }});
              entity.mesh.position.set(0, 0, 0);
              entity.mesh.scale.setScalar(1.5);
              entity.mesh.rotation.set(0.03, -0.06, 0.015);
              entity.update = () => entity.mesh.position.set(0, 0, 0);
              const camera = kg.engine.cameraController;
              camera.controls.autoRotate = false;
              camera.controls.enabled = false;
              camera.camera.position.set(0, 0.12, 4.2);
              camera.camera.lookAt(0, 0, 0);
              camera.camera.updateProjectionMatrix();
            }})()
            """
        )
        page.wait_for_timeout(700)
        page.screenshot(path=str(ARTIFACT_DIR / "planet-explicit-white-body.png"))

        check(not errors, "explicit-body projector run has no browser console errors")
        browser.close()

    if __import__("check_projector").FAILURES:
        print("\nExplicit body-colour acceptance FAILED")
        return 1
    print("\nExplicit body-colour acceptance passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
