#!/usr/bin/env python3
"""Browser acceptance for planet-wide preservation of kid-drawn traits."""

from __future__ import annotations

from pathlib import Path

from playwright.sync_api import sync_playwright

from check_projector import FAILURES, Server, check, wait_for
from check_visual_renderer import kid_disc_image, png_bytes

REPO_ROOT = Path(__file__).resolve().parent.parent
ARTIFACT_DIR = REPO_ROOT / "artifacts"


def main() -> int:
    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
    drawing = kid_disc_image()

    with Server() as server, sync_playwright() as pw:
        planet_id = server.upload(
            "Planet-wide Kid Design",
            artwork=png_bytes(drawing),
            style="classic",
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
        wait_for(page, "window.kidsGalaxy && window.kidsGalaxy.kidPlanets.size === 1", 12_000)
        wait_for(
            page,
            f"Boolean(window.kidsGalaxy.kidPlanets.get('{planet_id}')?.mesh?.material?.userData?.kidsGalaxyGlobalDesignProjection)",
            12_000,
        )

        result = page.evaluate(
            f"""
            (() => {{
              const p = window.kidsGalaxy.kidPlanets.get('{planet_id}');
              const group = p.sculptedArtworkGroup;
              const front = (group?.children || []).filter((mesh) =>
                mesh.isMesh &&
                mesh.userData?.kidsGalaxySculptedKidPatch &&
                !mesh.userData?.kidsGalaxyBackDesignEcho
              );
              const back = (group?.children || []).filter((mesh) =>
                mesh.isMesh && mesh.userData?.kidsGalaxyBackDesignEcho
              );

              const bounds = (meshes) => {{
                const result = {{ minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity }};
                meshes.forEach((mesh) => {{
                  const position = mesh.geometry?.getAttribute?.('position');
                  if (!position) return;
                  for (let index = 0; index < position.count; index += 1) {{
                    const x = position.getX(index);
                    const y = position.getY(index);
                    const z = position.getZ(index);
                    const length = Math.hypot(x, y, z) || 1;
                    const nx = x / length;
                    const ny = y / length;
                    result.minX = Math.min(result.minX, nx);
                    result.maxX = Math.max(result.maxX, nx);
                    result.minY = Math.min(result.minY, ny);
                    result.maxY = Math.max(result.maxY, ny);
                  }}
                }});
                return {{
                  width: Number.isFinite(result.minX) ? result.maxX - result.minX : 0,
                  height: Number.isFinite(result.minY) ? result.maxY - result.minY : 0,
                  ...result,
                }};
              }};

              const averageColour = (mesh) => {{
                const colours = mesh.geometry?.getAttribute?.('color');
                if (!colours?.count) return null;
                let r = 0, g = 0, b = 0;
                const stride = Math.max(1, Math.floor(colours.count / 96));
                let samples = 0;
                for (let index = 0; index < colours.count; index += stride) {{
                  r += colours.getX(index);
                  g += colours.getY(index);
                  b += colours.getZ(index);
                  samples += 1;
                }}
                return samples ? {{ r: r / samples, g: g / samples, b: b / samples }} : null;
              }};

              const colours = front.map(averageColour).filter(Boolean);
              const hasBlue = colours.some((c) => c.b > c.r * 1.25 && c.b > c.g * 1.05);
              const hasGreen = colours.some((c) => c.g > c.r * 1.12 && c.g > c.b * 0.88);
              const hasYellow = colours.some((c) => c.r > 0.58 && c.g > 0.52 && c.b < 0.45);
              const data = p.mesh.material.userData || {{}};
              const frontBounds = bounds(front);
              const backBounds = bounds(back);
              return {{
                mode: data.kidsGalaxyDesignProjectionMode,
                projected: Boolean(data.kidsGalaxyGlobalDesignProjection),
                storedFrontWidth: data.kidsGalaxyProjectedFrontWidth || 0,
                storedFrontHeight: data.kidsGalaxyProjectedFrontHeight || 0,
                scaleX: data.kidsGalaxyDesignScaleX || 0,
                scaleY: data.kidsGalaxyDesignScaleY || 0,
                frontBounds,
                backBounds,
                frontCount: front.length,
                backCount: back.length,
                hasBlue,
                hasGreen,
                hasYellow,
                bodyIsClean: !p.mesh.material.map && !p.mesh.material.bumpMap && !p.mesh.material.displacementMap,
              }};
            }})()
            """
        )

        print("\nplanet-wide kid trait projection")
        check(result["projected"], "global kid-design projection is active")
        check(
            result["mode"] == "preserved-traits-stretched-across-sphere",
            "projection stretches preserved traits instead of replacing them with a texture wrap",
        )
        check(result["frontCount"] >= 4, "multiple child-drawn traits remain separate sculpted pieces")
        check(
            result["frontBounds"]["width"] >= 1.55,
            "kid traits span most of the planet width instead of forming a central smudge",
        )
        check(
            result["frontBounds"]["height"] >= 1.35,
            "kid traits span most of the planet height instead of forming a central smudge",
        )
        check(
            result["frontBounds"]["minX"] <= -0.72 and result["frontBounds"]["maxX"] >= 0.72,
            "the preserved design reaches both sides of the visible sphere",
        )
        check(
            result["frontBounds"]["minY"] <= -0.62 and result["frontBounds"]["maxY"] >= 0.62,
            "the preserved design reaches the upper and lower parts of the sphere",
        )
        check(
            result["storedFrontWidth"] >= 1.55 and result["storedFrontHeight"] >= 1.35,
            "projection diagnostics report broad planet coverage",
        )
        check(
            result["scaleX"] >= 1.0 and result["scaleY"] >= 1.0,
            "planet-wide projection never shrinks the child's authored composition",
        )
        check(result["hasBlue"], "dominant blue child strokes remain visible as blue molded traits")
        check(result["hasGreen"], "green child traits keep their authored colour family")
        check(result["hasYellow"], "yellow child traits keep their authored colour family")
        check(result["bodyIsClean"], "broader coverage is still sculpted geometry, not a literal body texture")
        check(result["backCount"] >= 1, "the rotating planet retains styled traits on the far hemisphere")
        check(
            result["backBounds"]["width"] >= 1.15 and result["backBounds"]["height"] >= 0.9,
            "far-side traits are also spread across the rotating planet",
        )

        # Neutral comparison frame for human inspection in CI artifacts.
        page.evaluate(
            f"""
            (() => {{
              const kg = window.kidsGalaxy;
              const p = kg.kidPlanets.get('{planet_id}');
              const g = kg.engine.galaxyScene;
              const camera = kg.engine.cameraController;
              kg.scene.background.setHex(0xf7f6f3);
              kg.scene.fog = null;
              g.stars.visible = false;
              g.companions.forEach((record) => {{ record.mesh.visible = false; }});
              g.sunGroup.children.forEach((child) => {{ if (child.isMesh) child.visible = false; }});
              g.sunLight.visible = true;
              g.sunLight.position.set(3.7, 4.5, 5.6);
              g.sunLight.intensity = 2.4;
              g.sunLight.decay = 0;
              g.ambientLight.visible = true;
              g.ambientLight.color.setHex(0xffffff);
              g.ambientLight.intensity = 0.5;
              g.fillLight.visible = true;
              g.fillLight.intensity = 0.36;
              p.mesh.position.set(0, 0, 0);
              p.mesh.scale.setScalar(1.5);
              p.mesh.rotation.set(0.035, -0.055, 0.02);
              p.update = () => {{ p.mesh.position.set(0, 0, 0); }};
              camera.controls.autoRotate = false;
              camera.controls.enabled = false;
              camera.camera.position.set(0, 0.15, 4.15);
              camera.camera.lookAt(0, 0, 0);
              camera.camera.updateProjectionMatrix();
            }})()
            """
        )
        page.add_style_tag(
            content="#ui, #status, #celebration, #planet-name, #hint, #badge-label, #sparkles { display:none !important; } body { margin:0 !important; }"
        )
        page.wait_for_timeout(700)
        page.locator("canvas").screenshot(path=str(ARTIFACT_DIR / "artwork-coverage.png"))
        check((ARTIFACT_DIR / "artwork-coverage.png").exists(), "planet-wide artwork comparison frame rendered")
        check(errors == [], f"no browser console errors ({errors[:3]})")

        browser.close()

    if FAILURES:
        print(f"\n{len(FAILURES)} artwork coverage check(s) failed:")
        for failure in FAILURES:
            print(f"  - {failure}")
        return 1
    print("\nplanet-wide artwork coverage acceptance passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
