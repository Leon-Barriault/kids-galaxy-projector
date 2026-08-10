#!/usr/bin/env python3
"""Real-WebGL acceptance for explicit body colour and 480-degree stroke wrapping."""

from __future__ import annotations

import io
from pathlib import Path

from PIL import Image, ImageDraw
from playwright.sync_api import sync_playwright

from check_projector import FAILURES, Server, check, wait_for

REPO_ROOT = Path(__file__).resolve().parent.parent
ARTIFACT_DIR = REPO_ROOT / "artifacts"
BODY_COLOR = "#596fd8"
BODY_RGB = (89, 111, 216)


def colored_body_artwork() -> bytes:
    # Reproduce the old Android export shape: an opaque white square behind the
    # selected circular body colour. The white perimeter is transport residue,
    # not authored artwork, and must not become a 480-degree sculpted ring.
    image = Image.new("RGB", (256, 256), (255, 255, 255))
    draw = ImageDraw.Draw(image)
    draw.ellipse((8, 8, 247, 247), fill=BODY_RGB)
    draw.line(
        [(22, 72), (62, 38), (112, 92), (162, 48), (232, 88)],
        fill=(229, 57, 53),
        width=22,
        joint="curve",
    )
    draw.line(
        [(30, 192), (70, 154), (119, 210), (168, 158), (226, 196)],
        fill=(76, 175, 80),
        width=18,
        joint="curve",
    )
    # White is a valid brush colour. Keep a deliberate interior white stroke so
    # the acceptance test proves we reject only the perimeter artifact.
    draw.line([(111, 126), (145, 126)], fill=(255, 255, 255), width=12)
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def main() -> int:
    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)

    with Server() as server, sync_playwright() as pw:
        planet_id = server.upload(
            "Stroke Wrap World",
            artwork=colored_body_artwork(),
            style="classic",
            body_color=BODY_COLOR,
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
            f"window.kidsGalaxy?.kidPlanets?.get('{planet_id}')?.mesh?.material?.userData?.kidsGalaxyStrokeWrapDegrees === 480",
            12_000,
        )

        result = page.evaluate(
            f"""
            (() => {{
              const entity = window.kidsGalaxy.kidPlanets.get('{planet_id}');
              const material = entity.mesh.material;
              const group = entity.sculptedArtworkGroup;
              const front = (group?.children || []).filter((mesh) =>
                mesh.isMesh &&
                mesh.visible &&
                mesh.geometry?.userData?.kidsGalaxySculptedKidPatch &&
                !mesh.userData?.kidsGalaxyBackDesignEcho
              );
              const back = (group?.children || []).filter((mesh) =>
                mesh.isMesh && mesh.userData?.kidsGalaxyBackDesignEcho
              );
              const suppressedWhiteRims = (group?.children || []).filter((mesh) =>
                mesh.isMesh && mesh.userData?.kidsGalaxySuppressedWhiteDiscRim
              );

              let minWrapped = Infinity;
              let maxWrapped = -Infinity;
              let frontHemisphereVertices = 0;
              let farHemisphereVertices = 0;
              let whiteishVertices = 0;
              let colouredVertices = 0;

              front.forEach((mesh) => {{
                const geometry = mesh.geometry;
                minWrapped = Math.min(
                  minWrapped,
                  Number(geometry?.userData?.kidsGalaxyStrokeWrapLongitudeMin ?? Infinity),
                );
                maxWrapped = Math.max(
                  maxWrapped,
                  Number(geometry?.userData?.kidsGalaxyStrokeWrapLongitudeMax ?? -Infinity),
                );

                const position = geometry?.getAttribute?.('position');
                const colours = geometry?.getAttribute?.('color');
                if (position) {{
                  for (let index = 0; index < position.count; index += 1) {{
                    if (position.getZ(index) >= 0) frontHemisphereVertices += 1;
                    else farHemisphereVertices += 1;
                  }}
                }}
                if (colours) {{
                  for (let index = 0; index < colours.count; index += 1) {{
                    const r = colours.getX(index);
                    const g = colours.getY(index);
                    const b = colours.getZ(index);
                    colouredVertices += 1;
                    if (r > 0.82 && g > 0.82 && b > 0.82) whiteishVertices += 1;
                  }}
                }}
              }});

              return {{
                bodyHex: '#' + material.color.getHexString(),
                bodySource: material.userData?.kidsGalaxyBodyColorSource,
                cleanBody: !material.map && !material.bumpMap && !material.displacementMap,
                strokeOnly: Boolean(material.userData?.kidsGalaxyStrokeOnlyProjection),
                wrapDegrees: material.userData?.kidsGalaxyStrokeWrapDegrees || 0,
                mode: material.userData?.kidsGalaxyDesignProjectionMode,
                groupWrapDegrees: group?.userData?.kidsGalaxyStrokeWrapDegrees || 0,
                primaryCount: group?.userData?.kidsGalaxyStrokeWrapPrimaryPatchCount || 0,
                suppressedBackCount: group?.userData?.kidsGalaxySuppressedLegacyBackEchoCount || 0,
                suppressedWhiteRimCount: group?.userData?.kidsGalaxySuppressedWhiteDiscRimCount || 0,
                visibleBackCount: back.filter((mesh) => mesh.visible).length,
                visibleSuppressedWhiteRimCount: suppressedWhiteRims.filter((mesh) => mesh.visible).length,
                legacyShellsHidden: !entity.accentEdgeMesh.visible && !entity.accentMesh.visible,
                minWrapped: Number.isFinite(minWrapped) ? minWrapped : 0,
                maxWrapped: Number.isFinite(maxWrapped) ? maxWrapped : 0,
                frontHemisphereVertices,
                farHemisphereVertices,
                whiteishVertices,
                whiteFraction: colouredVertices ? whiteishVertices / colouredVertices : 1,
                allPrimaryMeshesWrapped: front.length > 0 && front.every((mesh) =>
                  mesh.geometry?.userData?.kidsGalaxyAngularStrokeWrap &&
                  mesh.geometry?.userData?.kidsGalaxyStrokeWrapDegrees === 480
                ),
              }};
            }})()
            """
        )

        check(result["bodyHex"].lower() == BODY_COLOR, "tablet background becomes the sphere colour")
        check(result["bodySource"] == "tablet-background", "sphere colour records tablet background authority")
        check(result["cleanBody"], "background stays a clean body material instead of a stretched texture")
        check(result["strokeOnly"], "only extracted kid strokes enter the final wrap stage")
        check(result["wrapDegrees"] == 480, "final material records a 480-degree stroke wrap")
        check(result["groupWrapDegrees"] == 480, "sculpted stroke group records the 480-degree wrap")
        check(result["allPrimaryMeshesWrapped"], "every visible primary kid-stroke mesh uses angular wrapping")
        check(result["primaryCount"] >= 3, "coloured and intentional white authored strokes remain distinct")
        check(result["visibleBackCount"] == 0, "legacy mirrored far-side copies are suppressed")
        check(result["suppressedBackCount"] >= 1, "the superseded back-echo geometry is explicitly suppressed")
        check(result["suppressedWhiteRimCount"] >= 1, "legacy white circular backing is recognized as a perimeter artifact")
        check(result["visibleSuppressedWhiteRimCount"] == 0, "legacy white circular backing never enters the 480-degree wrap")
        check(result["legacyShellsHidden"], "no white alpha-shell layer can separate strokes from the body")
        check(
            result["maxWrapped"] - result["minWrapped"] >= 470,
            "the authored stroke composition spans essentially the full 480-degree winding",
        )
        check(
            result["frontHemisphereVertices"] > 0 and result["farHemisphereVertices"] > 0,
            "one continuous stroke composition reaches both near and far hemispheres",
        )
        check(result["whiteishVertices"] > 0, "intentional interior white brushwork is preserved")
        check(result["whiteFraction"] < 0.35, "the perimeter artifact cannot dominate visible white geometry")

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
              entity.mesh.scale.setScalar(1.5);
              entity.mesh.rotation.set(0.03, -0.12, 0.015);
              entity.update = () => entity.mesh.position.set(0, 0, 0);
              camera.controls.autoRotate = false;
              camera.controls.enabled = false;
              camera.camera.position.set(0, 0.12, 4.2);
              camera.camera.lookAt(0, 0, 0);
              camera.camera.updateProjectionMatrix();
            }})()
            """
        )
        page.wait_for_timeout(700)
        page.locator("canvas").screenshot(path=str(ARTIFACT_DIR / "stroke-wrap-480.png"))
        check(not errors, f"stroke-wrap projector run has no browser console errors ({errors[:3]})")
        browser.close()

    if FAILURES:
        print(f"\n{len(FAILURES)} stroke-wrap check(s) failed:")
        for failure in FAILURES:
            print(f"  - {failure}")
        return 1
    print("\nstroke-only 480-degree wrap acceptance passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
