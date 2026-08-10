#!/usr/bin/env python3
"""Real-browser acceptance for sculpted kid artwork and Saturn particle rings."""

from __future__ import annotations

from pathlib import Path

from playwright.sync_api import sync_playwright

from check_projector import Server, check, wait_for
from check_visual_renderer import kid_disc_image, png_bytes

REPO_ROOT = Path(__file__).resolve().parent.parent
ARTIFACT_DIR = REPO_ROOT / "artifacts"
SELECTED_RING_COLOR = "#ff4f9a"


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
          g.ambientLight.intensity = 0.50;
          g.fillLight.visible = true;
          g.fillLight.color.setHex(0xdde8ff);
          g.fillLight.intensity = 0.36;

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
            ring_color=SELECTED_RING_COLOR,
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
              const data = p.mesh.material.userData || {{}};
              return {{
                trueSculpted: Boolean(data.kidsGalaxyTrueSculptedArtwork),
                projection: data.designProjection,
                patchCount: front.length,
                backCount: back.length,
                shellsHidden: !p.accentEdgeMesh.visible && !p.accentMesh.visible,
                bodyBlue: data.kidsGalaxyDominantGesturePalette === 4 || (c.b > c.g && c.g > c.r),
                dominantGesture: Boolean(data.kidsGalaxyDominantGestureRelief),
                dominantCoverage: data.kidsGalaxyDominantGestureCoverage || 0,
                allBeveled: front.every((mesh) => mesh.geometry?.userData?.kidsGalaxyBeveledKidPatch),
                allRoundedSlabs: front.every((mesh) => mesh.geometry?.userData?.kidsGalaxyRoundedSlab),
                hybridNormals: front.every((mesh) => mesh.geometry?.userData?.kidsGalaxyHybridSlabNormals),
                broadPlateau: front.every((mesh) => mesh.geometry?.userData?.kidsGalaxyBroadPlateau),
                minimumRelief: Math.min(...front.map((mesh) => mesh.geometry?.userData?.kidsGalaxyPatchRelief || 0)),
                minimumVertices: Math.min(...front.map((mesh) => mesh.geometry?.userData?.kidsGalaxyPatchVertexCount || 0)),
                physical: front.every((mesh) => mesh.material?.isMeshPhysicalMaterial),
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
        check(sculpted["allRoundedSlabs"], "kid pieces use the broad rounded-slab reference profile")
        check(sculpted["hybridNormals"], "slab tops stay smooth while shoulders retain physical depth")
        check(sculpted["broadPlateau"], "raised pieces keep broad tops instead of pinched domes")
        check(sculpted["minimumRelief"] >= 0.04, "kid patches stand visibly but softly proud of the body")
        check(sculpted["minimumVertices"] >= 30, "kid patch contours are smoothed into dense real geometry")
        check(sculpted["physical"], "sculpted kid patches use physically lit materials")
        check(sculpted["dominantGesture"], "partial dominant kid strokes remain visible in the body design")
        check(
            0.03 <= sculpted["dominantCoverage"] <= 0.48,
            "dominant gesture preservation only applies to deliberate partial paint",
        )

        print("\nSaturn-like particle ring")
        ring = page.evaluate(
            f"""
            (() => {{
              const p = window.kidsGalaxy.kidPlanets.get('{ringed}');
              const ring = p.decorations.find((item) => item.userData?.kidsGalaxySaturnParticleRing);
              const layers = ring?.children || [];
              const dust = layers.find((layer) => layer.isPoints && layer.userData?.kidsGalaxySaturnDust);
              const colors = dust?.geometry?.getAttribute('color');
              const average = {{ r: 0, g: 0, b: 0 }};
              let samples = 0;
              if (colors) {{
                const stride = Math.max(1, Math.floor(colors.count / 256));
                for (let index = 0; index < colors.count; index += stride) {{
                  average.r += colors.getX(index);
                  average.g += colors.getY(index);
                  average.b += colors.getZ(index);
                  samples += 1;
                }}
              }}
              if (samples) {{
                average.r /= samples;
                average.g /= samples;
                average.b /= samples;
              }}
              return {{
                saturn: Boolean(ring?.userData?.kidsGalaxySaturnParticleRing),
                solid: ring?.userData?.kidsGalaxyRingIsSolid,
                fineGrained: Boolean(ring?.userData?.kidsGalaxyFineGrainedSaturnRing),
                unresolvedBands: Boolean(ring?.userData?.kidsGalaxyUnresolvedParticleBands),
                colorFidelity: Boolean(ring?.userData?.kidsGalaxyRingColorFidelity),
                selectedColor: ring?.userData?.kidsGalaxySelectedRingColor,
                colorTreatment: ring?.userData?.kidsGalaxyRingColorTreatment,
                recolored: ring?.userData?.kidsGalaxyRecoloredParticleCount || 0,
                pinkChannelOrder: average.r > average.b && average.b > average.g,
                chroma: Math.max(average.r, average.g, average.b) - Math.min(average.r, average.g, average.b),
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
        check(ring["fineGrained"] and ring["unresolvedBands"], "fine particles merge optically into Saturn-like bands")
        check(not ring["solidGeometry"], "no visible solid annulus geometry remains around ringed planets")
        check(ring["particles"] >= 50_000, "ring has very dense fine dust, ice and sparse small-rock material")
        check(ring["ice"] and ring["rock"] and ring["dust"], "ring visibly mixes ice, rock and dust layers")
        check(ring["gap"] and ring["gap"][1] > ring["gap"][0], "ring keeps a Cassini-style separation")
        check(ring["speeds"] >= 3, "ring layers rotate at different angular speeds")
        check(ring["colorFidelity"], "ring colour fidelity pass is active")
        check(
            ring["selectedColor"] == SELECTED_RING_COLOR,
            "ring keeps the exact tablet-selected feature colour as its source hue",
        )
        check(
            ring["colorTreatment"] == "selected-hue-radial-variants",
            "ice, dust and rock vary around the selected hue instead of neutral grey",
        )
        check(ring["recolored"] >= 50_000, "the selected hue is applied across the complete particle system")
        check(ring["pinkChannelOrder"], "a saturated pink tablet choice remains visibly pink in ring particles")
        check(ring["chroma"] >= 0.12, "ring particles retain strong selected-colour chroma")

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
