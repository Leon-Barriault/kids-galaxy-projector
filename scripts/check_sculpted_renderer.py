#!/usr/bin/env python3
"""Real-browser acceptance for sculpted kid artwork and Saturn particle rings."""

from __future__ import annotations

from pathlib import Path

from playwright.sync_api import sync_playwright

from check_projector import Server, check, wait_for
from check_visual_renderer import kid_disc_image, png_bytes

REPO_ROOT = Path(__file__).resolve().parent.parent
ARTIFACT_DIR = REPO_ROOT / "artifacts"


def isolate_planet(page, planet_id: str, include_ring: bool) -> None:
    page.evaluate(
        """
        ([id, includeRing]) => {
          const kg = window.kidsGalaxy;
          const p = kg.kidPlanets.get(id);
          const g = kg.engine.galaxyScene;
          const camera = kg.engine.cameraController;
          if (!p) return false;

          kg.scene.background.setHex(0xf7f6f3);
          kg.scene.fog = null;
          kg.renderer.toneMappingExposure = 0.98;
          g.stars.visible = false;
          g.companions.forEach((record) => { record.mesh.visible = false; });
          g.sunGroup.children.forEach((child) => {
            if (child.isMesh) child.visible = false;
          });
          g.sunLight.visible = true;
          g.sunLight.position.set(3.7, 4.5, 5.6);
          g.sunLight.intensity = 2.4;
          g.sunLight.decay = 0;
          g.ambientLight.visible = true;
          g.ambientLight.color.setHex(0xffffff);
          g.ambientLight.intensity = 0.38;
          g.fillLight.visible = true;
          g.fillLight.color.setHex(0xdde8ff);
          g.fillLight.intensity = 0.22;

          // Remove scene guide lines from the comparison frame. This is test
          // presentation only; the production projector remains untouched.
          kg.scene.traverse((object) => {
            if (object.isLine || object.isLineLoop || object.isLineSegments) {
              object.visible = false;
            }
          });

          kg.kidPlanets.forEach((entity) => {
            const selected = entity === p;
            entity.mesh.visible = selected;
            entity.ring.visible = false;
            entity.decorations.forEach((decoration) => {
              decoration.visible = selected && includeRing;
            });
            entity.companions.forEach((record) => { record.object.visible = false; });
          });

          p.mesh.position.set(0, 0, 0);
          p.mesh.scale.setScalar(includeRing ? 1.02 : 1.5);
          p.mesh.rotation.set(0.035, -0.055, 0.02);
          p.decorations.forEach((decoration) => decoration.position.set(0, 0, 0));
          p.update = () => {
            p.mesh.position.set(0, 0, 0);
            p.decorations.forEach((decoration) => decoration.position.set(0, 0, 0));
          };

          camera.controls.autoRotate = false;
          camera.controls.enabled = false;
          camera.camera.position.set(0, 0.15, includeRing ? 5.15 : 4.15);
          camera.camera.lookAt(0, 0, 0);
          camera.camera.updateProjectionMatrix();
          return true;
        }
        """,
        [planet_id, include_ring],
    )
    page.wait_for_timeout(700)


def main() -> int:
    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
    drawing = kid_disc_image()
    drawing.save(ARTIFACT_DIR / "kid-drawing.png")

    with Server() as server, sync_playwright() as pw:
        classic = server.upload(
            "Sculpted Kid Classic",
            artwork=png_bytes(drawing),
            style="classic",
        )
        ringed = server.upload(
            "Sculpted Kid Ringed",
            artwork=png_bytes(drawing),
            style="ringed",
            ring_color="#b9d9e8",
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
        wait_for(page, "window.kidsGalaxy && window.kidsGalaxy.kidPlanets.size === 2", 12_000)
        wait_for(
            page,
            f"Boolean(window.kidsGalaxy.kidPlanets.get('{classic}')?.mesh?.material?.userData?.kidsGalaxyTrueSculptedArtwork)",
            12_000,
        )

        print("\ntrue sculpted kid artwork")
        sculpted = page.evaluate(
            f"""
            (() => {{
              const p = window.kidsGalaxy.kidPlanets.get('{classic}');
              const group = p.sculptedArtworkGroup;
              const patches = group?.children.filter((child) => child.userData?.kidsGalaxySculptedKidPatch) || [];
              const front = patches.filter((child) => !child.userData?.kidsGalaxyBackDesignEcho);
              const back = patches.filter((child) => child.userData?.kidsGalaxyBackDesignEcho);
              const c = p.mesh.material.color;
              return {{
                trueSculpted: Boolean(p.mesh.material.userData.kidsGalaxyTrueSculptedArtwork),
                projection: p.mesh.material.userData.designProjection,
                patchCount: front.length,
                backCount: back.length,
                shellsHidden: !p.accentEdgeMesh.visible && !p.accentMesh.visible,
                bodyBlue: c.b > c.g && c.g > c.r,
                allBeveled: front.every((mesh) => mesh.geometry?.userData?.kidsGalaxyBeveledKidPatch),
                minimumRelief: Math.min(...front.map((mesh) => mesh.geometry?.userData?.kidsGalaxyPatchRelief || 0)),
                minimumVertices: Math.min(...front.map((mesh) => mesh.geometry?.userData?.kidsGalaxyPatchVertexCount || 0)),
                physical: front.every((mesh) => mesh.material?.isMeshPhysicalMaterial),
                roughness: front[0]?.material?.roughness,
                clearcoat: front[0]?.material?.clearcoat,
              }};
            }})()
            """
        )
        check(sculpted["trueSculpted"], "valid kid artwork ends as real sculpted geometry")
        check(
            sculpted["projection"] == "true-beveled-kid-components-with-back-echo",
            "the child's visible component layout drives the front design",
        )
        check(sculpted["bodyBlue"], "dominant kid blue remains the coherent planet body")
        check(3 <= sculpted["patchCount"] <= 7, "separate child gestures remain separate molded pieces")
        check(sculpted["backCount"] <= 4, "only a smaller styled echo is added to the far hemisphere")
        check(sculpted["shellsHidden"], "flat alpha-shell artwork is removed from the final planet")
        check(sculpted["allBeveled"], "every visible kid patch has a physical beveled shoulder")
        check(sculpted["minimumRelief"] >= 0.045, "kid patches stand visibly proud of the body")
        check(sculpted["minimumVertices"] >= 18, "kid patch contours are smoothed into real geometry")
        check(sculpted["physical"], "sculpted kid patches use physically lit materials")

        print("\nSaturn-like particle ring")
        ring = page.evaluate(
            f"""
            (() => {{
              const p = window.kidsGalaxy.kidPlanets.get('{ringed}');
              const ring = p.decorations.find((item) => item.userData?.kidsGalaxySaturnParticleRing);
              const layers = ring?.children || [];
              return {{
                saturn: Boolean(ring?.userData?.kidsGalaxySaturnParticleRing),
                solid: ring?.userData?.kidsGalaxyRingIsSolid,
                particles: ring?.userData?.kidsGalaxyRingParticleCount || 0,
                gap: ring?.userData?.cassiniGap,
                ice: layers.some((layer) => layer.userData?.kidsGalaxyRingParticleKind === 'ice'),
                rock: layers.some((layer) => layer.userData?.kidsGalaxyRingParticleKind === 'rock'),
                dust: layers.some((layer) => layer.userData?.kidsGalaxySaturnDust),
                solidGeometry: layers.some((layer) => layer.geometry?.type === 'RingGeometry' || layer.geometry?.type === 'ExtrudeGeometry'),
                speeds: new Set(layers.map((layer) => layer.userData?.kidsGalaxyRingAngularSpeed).filter((value) => value > 0)).size,
              }};
            }})()
            """
        )
        check(ring["saturn"] and ring["solid"] is False, "ring is a Saturn particle system, not a solid record")
        check(not ring["solidGeometry"], "no solid annulus geometry remains around ringed planets")
        check(ring["particles"] >= 3000, "ring has dense fine dust, ice and small-rock material")
        check(ring["ice"] and ring["rock"] and ring["dust"], "ring visibly mixes ice, rock and dust layers")
        check(ring["gap"] and ring["gap"][1] > ring["gap"][0], "ring keeps a Cassini-style separation")
        check(ring["speeds"] >= 3, "ring layers rotate at different angular speeds")

        print("\nvisual comparison artifacts")
        page.add_style_tag(
            content="#ui, #status, #celebration, #planet-name, #hint, #badge-label, #sparkles { display:none !important; } body { margin:0 !important; }"
        )
        isolate_planet(page, classic, include_ring=False)
        page.locator("canvas").screenshot(path=str(ARTIFACT_DIR / "planet-classic.png"))
        isolate_planet(page, ringed, include_ring=True)
        page.locator("canvas").screenshot(path=str(ARTIFACT_DIR / "planet-ringed.png"))
        check((ARTIFACT_DIR / "planet-classic.png").exists(), "classic comparison frame rendered")
        check((ARTIFACT_DIR / "planet-ringed.png").exists(), "ringed comparison frame rendered")
        check(errors == [], f"no browser console errors ({errors[:3]})")

        browser.close()

    from check_projector import FAILURES

    if FAILURES:
        print(f"\n{len(FAILURES)} sculpted renderer check(s) failed:")
        for failure in FAILURES:
            print(f"  - {failure}")
        return 1
    print("\nsculpted renderer acceptance passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
