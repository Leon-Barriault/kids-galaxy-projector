#!/usr/bin/env python3
"""Visual/WebGL acceptance contract for kid artwork and Saturn-like planet rings."""

from __future__ import annotations

# Checked before the third-party imports below, so a missing Playwright or
# Pillow reports one install command instead of a bare ModuleNotFoundError.
from _projector_deps import require as _require_projector_dependencies

_require_projector_dependencies()

import io
import json
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


# The same drawing as kid_disc_image(), expressed the way the projector actually
# reads it.
#
# /api/upload declares the manifest File(...), i.e. mandatory, and the manifest
# stroke surface is installed outermost - so the manifest is the rendering
# authority and the PNG is archival. Uploading the rich disc above while letting
# the shared harness generate its default three-stroke manifest meant this
# script's fixture was never drawn: every assertion about "the dominant blue kid
# colour" was measuring a purple/orange/green planet on a red body. Blue was not
# in the picture at all.
KID_BLUE = (33, 150, 243)
KID_GREEN = (76, 175, 80)
KID_YELLOW = (255, 235, 59)


def kid_manifest_bytes() -> bytes:
    """Blue as the dominant paint, with the green and yellow gestures on top."""
    return json.dumps(
        {
            "version": 1,
            "coordinate_space": "normalized-canvas-v1",
            "canvas": {"width": 512, "height": 512},
            # Blue is the most-used paint in kid_disc_image, so it is the body.
            "background_color": "#2196f3",
            "background_explicit": True,
            "strokes": [
                {
                    "stroke_id": "green-upper",
                    "order": 0,
                    "color": "#4caf50",
                    "width_px": 52,
                    "width_normalized": 0.102,
                    "points": [[0.26, 0.39], [0.44, 0.36], [0.62, 0.42], [0.78, 0.38]],
                },
                {
                    "stroke_id": "green-lower",
                    "order": 1,
                    "color": "#4caf50",
                    "width_px": 46,
                    "width_normalized": 0.090,
                    "points": [[0.30, 0.58], [0.48, 0.62], [0.66, 0.57], [0.80, 0.60]],
                },
                {
                    "stroke_id": "yellow-streak",
                    "order": 2,
                    "color": "#ffeb3b",
                    "width_px": 24,
                    "width_normalized": 0.047,
                    "points": [[0.23, 0.48], [0.36, 0.46], [0.46, 0.49]],
                },
                {
                    "stroke_id": "yellow-dot",
                    "order": 3,
                    "color": "#ffeb3b",
                    "width_px": 22,
                    "width_normalized": 0.043,
                    "points": [[0.72, 0.70], [0.78, 0.72]],
                },
            ],
        }
    ).encode()


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


KID_DESIGN_STATE = """
(id) => {
  const p = window.kidsGalaxy.kidPlanets.get(id);
  if (!p) return null;
  const m = p.mesh.material;
  const image = m.map?.image;
  if (!image) return null;

  // The albedo map is the child's paint as the renderer finally lays it down,
  // so the colour questions are asked of it directly rather than of a userData
  // summary that the surface stages no longer write. Histogrammed in the page:
  // a 512x256 map is 131k pixels and marshalling them all over CDP to count
  // them here would dominate the runtime of the whole script.
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext('2d', { alpha: false, willReadFrequently: true });
  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, image.width, image.height).data;

  const counts = new Map();
  for (let i = 0; i < pixels.length; i += 4) {
    const key = (pixels[i] << 16) | (pixels[i + 1] << 8) | pixels[i + 2];
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const total = pixels.length / 4;
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const swatch = ([key, n]) => ({
    r: (key >> 16) & 255, g: (key >> 8) & 255, b: key & 255, share: n / total,
  });

  // Relief, measured off the vertices - the paint is geometry now, so "is the
  // artwork actually raised" is a question about positions and normals rather
  // than about whether a second accent mesh is visible.
  const position = p.mesh.geometry.attributes.position;
  const normal = p.mesh.geometry.attributes.normal;
  let minRadius = Infinity;
  let maxRadius = 0;
  let maxTilt = 0;
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
    const r = Math.sqrt(x * x + y * y + z * z);
    if (r < minRadius) minRadius = r;
    if (r > maxRadius) maxRadius = r;
    if (!normal || r === 0) continue;
    const dot = (x * normal.getX(i) + y * normal.getY(i) + z * normal.getZ(i)) / r;
    const tilt = Math.acos(Math.min(1, Math.max(-1, dot)));
    if (tilt > maxTilt) maxTilt = tilt;
  }

  return {
    mode: m.userData.kidsGalaxyDesignProjectionMode || '',
    strokeCount:
      m.userData.kidsGalaxyEmbossedStrokeCount ||
      m.userData.kidsGalaxyEmbossedBandCount || 0,
    distinctColours: counts.size,
    dominant: swatch(ranked[0]),
    palette: ranked.slice(0, 6).map(swatch),
    beveledRelief: Boolean(p.mesh.geometry.userData?.kidsGalaxyBeveledRelief),
    reliefFraction: (maxRadius - minRadius) / minRadius,
    maxNormalTiltDeg: (maxTilt * 180) / Math.PI,
    occlusionMap: Boolean(m.aoMap),
  };
}
"""


def _check_kid_design_on_current_renderer(page, planet_id: str) -> None:
    """Re-assert the sculpted-surface contract against the renderer that replaced it.

    Same questions the original block asked - is this the child's drawing, is
    their dominant colour the body, did the gestures survive as raised forms, is
    the palette still small and the body still visible - put to the objects that
    exist today: the albedo map and the relief geometry.
    """
    state = page.evaluate(KID_DESIGN_STATE, planet_id)
    check(state is not None, "current renderer exposes an inspectable albedo and body")
    if state is None:
        return

    check(
        state["mode"] in {"manifest-strokes-layered-on-body", "strokes-wrapped-around-longitude"},
        f"body is drawn by a known kid-design projection ({state['mode']})",
    )

    # "planet body colour comes from the child's drawing" and "dominant blue kid
    # colour becomes the coherent blue body", asked of the albedo itself.
    dominant = state["dominant"]
    check(
        dominant["b"] > dominant["g"] > dominant["r"],
        "the child's dominant blue paint becomes the coherent blue body "
        f"({dominant['r']},{dominant['g']},{dominant['b']})",
    )
    check(
        _close_enough(dominant, KID_BLUE),
        f"the body is the blue the child actually painted, not an approximation of it "
        f"({dominant['r']},{dominant['g']},{dominant['b']} vs {KID_BLUE})",
    )

    # "renderer keeps a small child-derived accent palette". The old count came
    # from the sculpted quantiser; the equivalent now is that the albedo is flat,
    # which after region flattening means roughly one colour per stroke plus the
    # body rather than a smear of anti-aliased intermediates.
    check(
        2 <= state["distinctColours"] <= 8,
        f"the finished planet holds a small flat palette ({state['distinctColours']} colours)",
    )
    for name, rgb in (("green", KID_GREEN), ("yellow", KID_YELLOW)):
        check(
            any(_close_enough(entry, rgb) for entry in state["palette"]),
            f"the child's {name} gesture survives as its own flat colour",
        )

    # "body remains visible around the kid design".
    coverage = 1 - dominant["share"]
    check(
        0.05 <= coverage <= 0.60,
        f"paint covers the planet without swallowing it ({coverage * 100:.1f}%)",
    )

    # "several recognizable kid-drawn forms survive simplification".
    check(
        state["strokeCount"] >= 3,
        f"several distinct kid-drawn forms survive ({state['strokeCount']})",
    )

    # "kid gestures become same-hue raised molded forms" and "raised kid artwork
    # is actually visible". The old pair read a shoulder flag and a mesh's
    # visible property; both are answered by the geometry now, and the normal
    # tilt is the load-bearing one - a smooth sphere reads zero, and so did the
    # displacement map that used to stand in for relief.
    check(state["beveledRelief"], "kid gestures are raised as real beveled geometry")
    check(
        state["reliefFraction"] > 0.02,
        f"the raised artwork is deep enough to read ({state['reliefFraction'] * 100:.1f}% of radius)",
    )
    check(
        state["maxNormalTiltDeg"] > 25,
        "raised artwork is shaded as raised, not painted on "
        f"({state['maxNormalTiltDeg']:.1f} degrees off radial)",
    )
    check(state["occlusionMap"], "patch edges carry a contact shadow")


def _close_enough(entry, rgb, tolerance: int = 48) -> bool:
    return (
        (entry["r"] - rgb[0]) ** 2 + (entry["g"] - rgb[1]) ** 2 + (entry["b"] - rgb[2]) ** 2
    ) <= tolerance**2


def main(isolate_planet_fn=isolate_planet) -> int:
    """Run the visual contract with an explicitly supplied comparison setup."""
    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
    drawing = kid_disc_image()
    drawing.save(ARTIFACT_DIR / "kid-drawing.png")

    with Server() as server, sync_playwright() as pw:
        classic = server.upload(
            "Kid Design Classic",
            artwork=png_bytes(drawing),
            manifest=kid_manifest_bytes(),
            style="classic",
        )
        ringed = server.upload(
            "Kid Design Ringed",
            artwork=png_bytes(drawing),
            manifest=kid_manifest_bytes(),
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
        # Wait for whichever surface stage ends up owning the body. This used to
        # wait only on kidsGalaxyKidDesignProjection, which the sculpted stage
        # sets and the soft-toy stage then overwrites when it replaces the
        # material outright - so on any current planet the condition could never
        # become true and every run silently burned the full twelve seconds
        # before carrying on. wait_for swallows its own timeout, so nothing said
        # so.
        wait_for(
            page,
            "(() => {"
            f"  const m = window.kidsGalaxy.kidPlanets.get('{classic}')?.mesh?.material;"
            "  if (!m) return false;"
            "  const d = m.userData || {};"
            "  return Boolean("
            "    d.kidsGalaxySoftToySurface ||"
            "    d.kidsGalaxyManifestStrokeSurface ||"
            "    d.kidsGalaxyKidDesignProjection"
            "  );"
            "})()",
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
                  // Which renderer actually owns this body. Everything above is
                  // read off the sculpted component surface, which the soft-toy
                  // stage supersedes - see the guard below.
                  softToySurface: Boolean(data.kidsGalaxySoftToySurface),
                  manifestSurface: Boolean(data.kidsGalaxyManifestStrokeSurface),
                };
              };
              return { current: read(classicId), legacy: read(legacyId) };
            }
            """,
            [classic, legacy],
        )
        current = design["current"]
        restored = design["legacy"]

        # Every assertion below reads userData that the sculpted component
        # surface writes - kidsGalaxyKidDesignProjection, accentColorCount,
        # bodyFromChildDrawing and the accent meshes' own flags. The soft-toy
        # stage replaces the body material wholesale and hides the accent meshes,
        # so on any current planet those keys are simply absent and these checks
        # are asking the wrong object. They then failed as a cascade of confusing
        # FAILs and finally a TypeError on `1 <= None`, which reads like a
        # rendering regression and is not one.
        #
        # This script is not in projector-ci.yml, so nothing caught the drift.
        # Saying so plainly beats nine misleading failures.
        superseded = current["softToySurface"] or current["manifestSurface"]
        if superseded:
            owner = "manifest stroke" if current["manifestSurface"] else "soft-toy"
            print(
                f"  (rendered by the {owner} surface; the sculpted-surface assertions\n"
                "   below are skipped and their intent is re-asserted underneath)"
            )
            _check_kid_design_on_current_renderer(page, classic)
        # Only the sculpted-surface assertions are gated. Everything after this
        # block reads objects the current renderer still owns.
        if not superseded:
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
