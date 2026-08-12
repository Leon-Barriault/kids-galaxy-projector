#!/usr/bin/env python3
"""Visual/WebGL acceptance contract for kid artwork and Saturn-like planet rings."""

from __future__ import annotations

import io
import math
from pathlib import Path

from PIL import Image, ImageDraw
from playwright.sync_api import sync_playwright

from check_projector import Server, check, chromium_executable, wait_for

REPO_ROOT = Path(__file__).resolve().parent.parent
ARTIFACT_DIR = REPO_ROOT / "artifacts"


def kid_disc_image() -> Image.Image:
    """A representative tablet drawing: blue look with green/yellow child gestures."""
    image = Image.new("RGB", (512, 512), "white")
    draw = ImageDraw.Draw(image)

    # Blue is deliberately the most-used paint. It should become the coherent
    # body colour without forcing the child to fill the entire planet disc.
    draw.line(
        [(95, 112), (172, 80), (260, 105), (344, 82), (418, 124)],
        fill=(33, 150, 243),
        width=58,
        joint="curve",
    )
    draw.line(
        [(80, 390), (168, 350), (260, 382), (352, 348), (430, 386)],
        fill=(33, 150, 243),
        width=52,
        joint="curve",
    )

    # Organic child-drawn shapes that should remain recognizable raised forms.
    green = (76, 175, 80)
    draw.rounded_rectangle((132, 158, 238, 245), radius=35, fill=green)
    draw.ellipse((286, 175, 400, 264), fill=green)
    draw.rounded_rectangle((226, 276, 350, 342), radius=30, fill=green)
    draw.line(
        [(145, 286), (174, 265), (208, 276), (224, 315), (202, 338), (159, 330)],
        fill=green,
        width=30,
        joint="curve",
    )

    yellow = (255, 235, 59)
    draw.line(
        [(118, 253), (166, 236), (204, 247)],
        fill=yellow,
        width=22,
        joint="curve",
    )
    draw.ellipse((356, 297, 394, 330), fill=yellow)
    return image


def png_bytes(image: Image.Image) -> bytes:
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def legacy_polar_png(image: Image.Image, width: int = 512, height: int = 256) -> bytes:
    """Encode the historical centre-to-pole/rim-to-pole mapping for compatibility QA."""
    source = image.resize((512, 512), Image.Resampling.BILINEAR)
    src = source.load()
    output = Image.new("RGB", (width, height), "white")
    dst = output.load()
    centre = 255.5
    radius = 248.0
    for y in range(height):
        v = (y + 0.5) / height
        radial = min(1.0, max(0.0, v))
        for x in range(width):
            u = (x + 0.5) / width
            angle = u * math.tau
            sx = round(centre + radial * radius * math.cos(angle))
            sy = round(centre + radial * radius * math.sin(angle))
            dst[x, y] = src[max(0, min(511, sx)), max(0, min(511, sy))]
    return png_bytes(output)


def isolate_planet(page, planet_id: str, include_ring: bool) -> None:
    page.evaluate(
        """
        ([id, includeRing]) => {
          const kg = window.kidsGalaxy;
          const p = kg.kidPlanets.get(id);
          const g = kg.engine.galaxyScene;
          const cameraController = kg.engine.cameraController;
          if (!p) return false;

          // Neutral studio-style visual comparison setup. This changes only the
          // test browser, never projector production behavior.
          kg.scene.background.setHex(0xf4f4f1);
          kg.scene.fog = null;
          g.stars.visible = false;
          g.companions.forEach((record) => { record.mesh.visible = false; });
          g.sunGroup.visible = true;
          g.sunGroup.children.forEach((child) => {
            if (child.isMesh) child.visible = false;
          });
          g.sunLight.visible = true;
          g.sunLight.position.set(3.8, 4.5, 5.5);
          g.sunLight.intensity = 34;
          g.sunLight.decay = 0;
          g.ambientLight.visible = true;
          g.ambientLight.intensity = 0.72;
          g.fillLight.visible = true;
          g.fillLight.intensity = 0.34;

          kg.kidPlanets.forEach((entity) => {
            entity.mesh.visible = entity === p;
            entity.ring.visible = false;
            entity.decorations.forEach((decoration) => {
              decoration.visible = entity === p && includeRing;
            });
            entity.companions.forEach((record) => { record.object.visible = false; });
          });

          p.mesh.position.set(0, 0, 0);
          p.mesh.scale.setScalar(includeRing ? 1.0 : 1.32);
          p.mesh.rotation.set(0.08, -0.38, 0.03);
          p.decorations.forEach((decoration) => decoration.position.set(0, 0, 0));
          p.update = () => {
            p.mesh.position.set(0, 0, 0);
            p.decorations.forEach((decoration) => decoration.position.set(0, 0, 0));
          };

          cameraController.controls.autoRotate = false;
          cameraController.controls.enabled = false;
          cameraController.camera.position.set(0, 0.25, includeRing ? 5.6 : 4.7);
          cameraController.camera.lookAt(0, 0, 0);
          cameraController.camera.updateProjectionMatrix();
          return true;
        }
        """,
        [planet_id, include_ring],
    )
    page.wait_for_timeout(500)


def main(isolate_planet_fn=isolate_planet) -> int:
    """Run the visual contract with an explicitly supplied comparison setup."""
    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
    drawing = kid_disc_image()
    drawing.save(ARTIFACT_DIR / "kid-drawing.png")

    with Server() as server, sync_playwright() as pw:
        classic = server.upload(
            "Kid Design Classic",
            artwork=png_bytes(drawing),
            style="classic",
        )
        ringed = server.upload(
            "Kid Design Ringed",
            artwork=png_bytes(drawing),
            style="ringed",
            ring_color="#b9d9e8",
        )
        legacy = server.upload(
            "Legacy Kid Design",
            artwork=legacy_polar_png(drawing),
            style="classic",
        )

        browser = pw.chromium.launch(
            executable_path=chromium_executable(),
            args=["--use-gl=swiftshader", "--enable-unsafe-swiftshader"],
        )
        page = browser.new_page(viewport={"width": 1000, "height": 1000})
        errors: list[str] = []
        page.on(
            "console",
            lambda message: errors.append(message.text) if message.type == "error" else None,
        )
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto(f"{server.base}/", wait_until="load")
        wait_for(page, "window.kidsGalaxy && window.kidsGalaxy.kidPlanets.size === 3", 12_000)
        wait_for(
            page,
            f"(() => window.kidsGalaxy.kidPlanets.get('{classic}')?.mesh?.material?.userData?.kidsGalaxyKidDesignProjection === true)()",
            12_000,
        )

        print("\nkid drawing is the planet art direction")
        design = page.evaluate(
            """
            ([classicId, legacyId]) => {
              const read = (id) => {
                const p = window.kidsGalaxy.kidPlanets.get(id);
                const data = p.mesh.material.userData;
                const c = p.mesh.material.color;
                return {
                  kidProjection: Boolean(data.kidsGalaxyKidDesignProjection),
                  sourceFormat: data.sourceArtworkFormat,
                  projection: data.designProjection,
                  bodyFromDrawing: Boolean(data.bodyFromChildDrawing),
                  sourcePaintCoverage: data.sourcePaintCoverage,
                  accentCoverage: data.accentCoverage,
                  accentColorCount: data.accentColorCount,
                  componentCount: data.componentCount,
                  body: { r: c.r, g: c.g, b: c.b },
                  edge: Boolean(p.accentEdgeMesh.material.userData.kidsGalaxySameHueShoulder),
                  top: Boolean(p.accentMesh.material.userData.kidsGalaxyPreservesKidGesture),
                  edgeVisible: p.accentEdgeMesh.visible,
                  topVisible: p.accentMesh.visible,
                };
              };
              return { current: read(classicId), legacy: read(legacyId) };
            }
            """,
            [classic, legacy],
        )
        current = design["current"]
        restored = design["legacy"]
        check(current["kidProjection"], "new tablet disc uses the kid-design projection")
        check(current["sourceFormat"] == "kid-disc", "new upload remains the actual child drawing disc")
        check(
            current["projection"] == "recognizable-front-with-styled-back-echo",
            "child's visible design is preserved on the recognizable front hemisphere",
        )
        check(current["bodyFromDrawing"], "planet body colour comes from the child's drawing")
        check(
            current["body"]["b"] > current["body"]["g"] > current["body"]["r"],
            "dominant blue kid colour becomes the coherent blue body",
        )
        check(current["edge"] and current["top"], "kid gestures become same-hue raised molded forms")
        check(current["edgeVisible"] and current["topVisible"], "raised kid artwork is actually visible")
        check(1 <= current["accentColorCount"] <= 3, "renderer keeps a small child-derived accent palette")
        check(current["componentCount"] >= 3, "several recognizable kid-drawn forms survive simplification")
        check(0.07 <= current["accentCoverage"] <= 0.45, "body remains visible around the kid design")
        check(
            restored["sourceFormat"] == "legacy-polar-equirectangular" and restored["kidProjection"],
            "already-stored legacy planets are decoded back to the child drawing first",
        )
        check(
            restored["body"]["b"] > restored["body"]["g"] > restored["body"]["r"],
            "legacy recovery keeps the same child-selected blue look",
        )

        print("\nSaturn-like particle ring")
        ring = page.evaluate(
            f"""
            (() => {{
              const p = window.kidsGalaxy.kidPlanets.get('{ringed}');
              const ring = p.decorations[0];
              const layers = ring.children.map((child) => ({{
                type: child.type,
                geometry: child.geometry?.type,
                particles: child.userData?.particleCount || 0,
                speed: child.userData?.kidsGalaxyRingAngularSpeed || 0,
                kind: child.userData?.kidsGalaxyRingParticleKind || null,
                dust: Boolean(child.userData?.kidsGalaxySaturnDust),
                haze: Boolean(child.userData?.kidsGalaxySaturnHaze),
              }}));
              return {{
                saturn: Boolean(ring.userData.kidsGalaxySaturnParticleRing),
                solid: ring.userData.kidsGalaxyRingIsSolid,
                differential: Boolean(ring.userData.kidsGalaxyDifferentialRotation),
                totalParticles: ring.userData.kidsGalaxyRingParticleCount,
                cassiniGap: ring.userData.cassiniGap,
                layers,
                hasSolidAnnulus: layers.some((layer) => layer.geometry === 'RingGeometry' || layer.geometry === 'ExtrudeGeometry'),
                distinctSpeeds: new Set(layers.map((layer) => layer.speed).filter((speed) => speed > 0)).size,
              }};
            }})()
            """
        )
        check(ring["saturn"] and ring["solid"] is False, "ring is a particulate Saturn system, not a solid record")
        check(not ring["hasSolidAnnulus"], "no opaque RingGeometry/ExtrudeGeometry disc remains")
        check(ring["totalParticles"] >= 3000, "ring contains dense dust, ice and small-rock particles")
        check(any(layer["kind"] == "ice" for layer in ring["layers"]), "ring includes reflective ice chunks")
        check(any(layer["kind"] == "rock" for layer in ring["layers"]), "ring includes darker small rocks")
        check(any(layer["dust"] for layer in ring["layers"]), "ring includes fine dust")
        check(ring["cassiniGap"] and ring["cassiniGap"][1] > ring["cassiniGap"][0], "ring has a visible Cassini-style gap")
        check(ring["differential"] and ring["distinctSpeeds"] >= 3, "ring layers rotate around the planet at different speeds")

        print("\nvisual comparison artifacts")
        page.add_style_tag(
            content="#ui, #status, #celebration, #planet-name, #hint, #badge-label, #sparkles { display:none !important; } body { margin:0 !important; }"
        )
        isolate_planet_fn(page, classic, include_ring=False)
        page.locator("canvas").screenshot(path=str(ARTIFACT_DIR / "planet-classic.png"))
        isolate_planet_fn(page, ringed, include_ring=True)
        page.locator("canvas").screenshot(path=str(ARTIFACT_DIR / "planet-ringed.png"))
        check((ARTIFACT_DIR / "planet-classic.png").exists(), "classic visual comparison PNG was rendered")
        check((ARTIFACT_DIR / "planet-ringed.png").exists(), "ringed visual comparison PNG was rendered")
        check(errors == [], f"no browser console errors ({errors[:3]})")

        browser.close()

    from check_projector import FAILURES

    if FAILURES:
        print(f"\n{len(FAILURES)} visual renderer check(s) failed:")
        for failure in FAILURES:
            print(f"  - {failure}")
        return 1
    print("\nvisual renderer contract passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
