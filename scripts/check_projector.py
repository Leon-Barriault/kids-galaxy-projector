#!/usr/bin/env python3
"""Core real-browser smoke test for the current projector runtime.

The drawing manifest is the single rendering contract. Focused visual scripts
own detailed appearance assertions; this file protects composition, WebGL,
planet features, and live lifecycle behavior without pinning obsolete renderers.
"""

from __future__ import annotations

# Checked before the third-party imports below, so a missing Playwright or
# Pillow reports one install command instead of a bare ModuleNotFoundError.
from _projector_deps import require as _require_projector_dependencies

_require_projector_dependencies()

import io
import json
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import time
from pathlib import Path

import httpx
from PIL import Image, ImageDraw
from playwright.sync_api import sync_playwright

REPO_ROOT = Path(__file__).resolve().parent.parent
SERVER_DIR = REPO_ROOT / "pi-server"


def chromium_executable() -> str | None:
    """Launch the full Chromium available on this host."""
    builds = sorted(Path("/opt/pw-browsers").glob("chromium-*/chrome-linux/chrome"))
    return str(builds[-1]) if builds else None


def free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def png_bytes(colour: tuple[int, int, int]) -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", (64, 64), colour).save(buffer, format="PNG")
    return buffer.getvalue()


def kid_style_png_bytes() -> bytes:
    """Representative archival PNG; the manifest remains rendering authority."""
    image = Image.new("RGB", (64, 64), (33, 150, 243))
    draw = ImageDraw.Draw(image)
    draw.line(
        [(1, 15), (13, 11), (26, 17), (39, 13), (52, 19), (63, 15)],
        fill=(76, 175, 80),
        width=10,
        joint="curve",
    )
    draw.line(
        [(3, 45), (17, 39), (31, 45), (46, 40), (62, 46)],
        fill=(255, 235, 59),
        width=8,
        joint="curve",
    )
    draw.ellipse((38, 24, 55, 36), fill=(255, 152, 0))
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def _hex_colour(colour: tuple[int, int, int]) -> str:
    return "#{:02x}{:02x}{:02x}".format(*colour)


def drawing_manifest_bytes(background: str) -> bytes:
    """Small modern tablet-equivalent manifest used by shared browser fixtures."""
    payload = {
        "version": 1,
        "coordinate_space": "normalized-canvas-v1",
        "canvas": {"width": 64, "height": 64},
        "background_color": background.lower(),
        "background_explicit": True,
        "strokes": [
            {
                "order": 0,
                "color": "#7b1fa2",
                "width_px": 8,
                "width_normalized": 0.125,
                "points": [[0.12, 0.16], [0.5, 0.18], [0.88, 0.15]],
            },
            {
                "order": 1,
                "color": "#f57c00",
                "width_px": 7,
                "width_normalized": 0.109375,
                "points": [[0.18, 0.43], [0.5, 0.46], [0.82, 0.42]],
            },
            {
                "order": 2,
                "color": "#43a047",
                "width_px": 6,
                "width_normalized": 0.09375,
                "points": [[0.49, 0.58], [0.52, 0.74], [0.5, 0.9]],
            },
        ],
        "raster": {
            "background_fill": "solid",
            "stroke_cap": "round",
            "stroke_join": "round",
            "stroke_order": "oldest-to-newest",
        },
    }
    return json.dumps(payload).encode()


class Server:
    """Disposable local FastAPI server used by projector browser contracts."""

    def __init__(self) -> None:
        self.port = free_port()
        self.root = Path(tempfile.mkdtemp(prefix="kg-projector-"))
        self.uploads = self.root / "uploads"
        self.state = self.root / "state"
        self.base = f"http://127.0.0.1:{self.port}"
        self._process: subprocess.Popen | None = None
        self._log = None

    def __enter__(self) -> "Server":
        env = {
            **os.environ,
            "PYTHONPATH": str(SERVER_DIR),
            "UPLOAD_DIR": str(self.uploads),
            "STATE_DIR": str(self.state),
            "STATIC_DIR": str(SERVER_DIR / "static"),
            "RATE_LIMIT_SECONDS": "0",
            "ENVIRONMENT": "development",
            "ADVERTISE": "false",
        }
        self._log = tempfile.NamedTemporaryFile(  # noqa: SIM115 - closed in __exit__
            mode="w+", suffix=".log", prefix="kg-server-", delete=False
        )
        self._process = subprocess.Popen(
            [sys.executable, "-m", "uvicorn", "main:app", "--port", str(self.port)],
            cwd=SERVER_DIR,
            env=env,
            stdout=self._log,
            stderr=subprocess.STDOUT,
        )
        deadline = time.time() + 30
        while time.time() < deadline:
            if self._process.poll() is not None:
                break
            try:
                if httpx.get(f"{self.base}/health", timeout=1).status_code == 200:
                    return self
            except httpx.HTTPError:
                time.sleep(0.2)

        self._log.flush()
        detail = Path(self._log.name).read_text(encoding="utf-8", errors="replace").strip()
        raise RuntimeError(
            "server did not start"
            + (f"; last output:\n{detail[-2000:]}" if detail else " and logged nothing")
        )

    def __exit__(self, *_exc: object) -> None:
        if self._process:
            self._process.terminate()
            self._process.wait(timeout=10)
        if self._log:
            self._log.close()
            Path(self._log.name).unlink(missing_ok=True)
            self._log = None
        shutil.rmtree(self.root, ignore_errors=True)

    def upload(
        self,
        name: str,
        colour: tuple[int, int, int] = (200, 30, 30),
        artwork: bytes | None = None,
        manifest: bytes | None = None,
        **design: str,
    ) -> str:
        """Upload a planet, optionally with a caller-supplied drawing manifest.

        The manifest is not optional at the API - /api/upload declares it
        File(...) - and the manifest stroke surface is installed outermost, so
        whatever is sent here is what the projector renders. A caller passing
        rich `artwork` and letting this build the default three-stroke manifest
        is therefore uploading a picture that will never be drawn: the generic
        manifest wins. Scripts whose fixture *is* the drawing need to pass both.
        """
        background = design.get("body_color") or _hex_colour(colour)
        response = httpx.post(
            f"{self.base}/api/upload",
            files={
                "file": (
                    "planet.png",
                    artwork if artwork is not None else png_bytes(colour),
                    "image/png",
                ),
                "manifest": (
                    "drawing-manifest.json",
                    manifest if manifest is not None else drawing_manifest_bytes(background),
                    "application/json",
                ),
            },
            data={"name": name, **design},
            timeout=10,
        )
        response.raise_for_status()
        return response.json()["planet_id"]

    def delete(self, planet_id: str) -> int:
        return httpx.delete(f"{self.base}/api/planets/{planet_id}", timeout=10).status_code

    def clear(self) -> int:
        return httpx.delete(f"{self.base}/api/planets", timeout=10).status_code

    def update_behavior(self, **overrides) -> dict:
        settings = httpx.get(f"{self.base}/api/behavior", timeout=10).json()["settings"]
        settings.update(overrides)
        response = httpx.put(f"{self.base}/api/behavior", json=settings, timeout=10)
        response.raise_for_status()
        return response.json()


FAILURES: list[str] = []


def check(condition: bool, description: str) -> None:
    print(f"  {'PASS' if condition else 'FAIL'}  {description}")
    if not condition:
        FAILURES.append(description)


def wait_for(page, expression: str, timeout_ms: int = 8000) -> None:
    try:
        page.wait_for_function(expression, timeout=timeout_ms)
    except Exception:  # noqa: BLE001 - check() reports the useful failure
        pass


def planet_ids(page) -> list[str]:
    return page.evaluate("Array.from(window.kidsGalaxy.kidPlanets.keys())")


def core_render_state(page, planet_id: str) -> dict:
    return page.evaluate(
        """
        (id) => {
          const kg = window.kidsGalaxy;
          const p = kg.kidPlanets.get(id);
          const g = kg.engine.galaxyScene;
          const m = p.mesh.material;
          // Relief now lives in the vertices rather than in a displacementMap,
          // so it is measured off the geometry. A normal that has swung away
          // from radial is the load-bearing number: on a smooth sphere every
          // normal is radial, and a displacementMap leaves them that way because
          // three.js does not recompute normals after displacing.
          const relief = (() => {
            const position = p.mesh.geometry.attributes.position;
            const normal = p.mesh.geometry.attributes.normal;
            let minRadius = Infinity;
            let maxRadius = 0;
            let maxTilt = 0;
            for (let i = 0; i < position.count; i += 1) {
              const x = position.getX(i);
              const y = position.getY(i);
              const z = position.getZ(i);
              const r = Math.sqrt(x * x + y * y + z * z);
              if (r < minRadius) minRadius = r;
              if (r > maxRadius) maxRadius = r;
              if (!normal || r === 0) continue;
              const dot = (x * normal.getX(i) + y * normal.getY(i) + z * normal.getZ(i)) / r;
              const tilt = Math.acos(Math.min(1, Math.max(-1, dot)));
              if (tilt > maxTilt) maxTilt = tilt;
            }
            return { minRadius, maxRadius, maxNormalTiltDeg: (maxTilt * 180) / Math.PI };
          })();
          return {
            pipeline: kg.renderPipeline || [],
            qualityProfile: g.renderer.userData.kidsGalaxyQualityProfile,
            material: m.type,
            widthSegments: p.mesh.geometry.parameters.widthSegments,
            heightSegments: p.mesh.geometry.parameters.heightSegments,
            manifest: Boolean(p.drawingManifest),
            manifestSurface: Boolean(m.userData.kidsGalaxyManifestStrokeSurface),
            projectionMode: m.userData.kidsGalaxyDesignProjectionMode || '',
            strokeCount: m.userData.kidsGalaxyEmbossedStrokeCount || 0,
            layerLevels: m.userData.kidsGalaxyEmbossLayerLevels || [],
            background: p.mesh.userData.kidsGalaxyManifestBackground || '',
            beveledRelief: Boolean(p.mesh.geometry.userData?.kidsGalaxyBeveledRelief),
            reliefDepth: relief.maxRadius - relief.minRadius,
            reliefFraction: (relief.maxRadius - relief.minRadius) / relief.minRadius,
            maxNormalTiltDeg: relief.maxNormalTiltDeg,
            occlusionMap: Boolean(m.aoMap),
            // Paint is raised by moving vertices now. A displacement map on top
            // of already-displaced geometry would raise every stroke twice, so
            // its absence is the assertion, not its presence.
            displacement: Boolean(m.displacementMap),
            bump: Boolean(m.bumpMap),
            roughness: m.roughness,
            metalness: m.metalness,
            clearcoat: m.clearcoat || 0,
            roughnessMap: Boolean(m.roughnessMap),
            environmentLit: Boolean(m.envMap),
            // The projector page loads three as an ES module, so THREE is not a
            // global here and the constant has to be compared by value.
            // NeutralToneMapping is 7 in the vendored build; ACESFilmic was 4.
            toneMapping: g.renderer.toneMapping,
            toneMappingExposure: g.renderer.toneMappingExposure,
            shadows: g.renderer.shadowMap.enabled,
            sunCastsShadow: g.sunLight.castShadow,
            internalWidth: g.renderer.userData.kidsGalaxyInternalWidth,
            internalHeight: g.renderer.userData.kidsGalaxyInternalHeight,
          };
        }
        """,
        planet_id,
    )


def saturn_ring_state(page, planet_id: str) -> dict:
    return page.evaluate(
        """
        (id) => {
          const p = window.kidsGalaxy.kidPlanets.get(id);
          const ring = p.decorations.find((d) => d.userData?.kidsGalaxySaturnParticleRing);
          const layers = ring?.children || [];
          const speeds = layers
            .map((layer) => layer.userData?.kidsGalaxyRingAngularSpeed || 0)
            .filter((speed) => speed > 0);
          return {
            present: Boolean(ring),
            solid: ring?.userData?.kidsGalaxyRingIsSolid,
            differential: Boolean(ring?.userData?.kidsGalaxyDifferentialRotation),
            particles: ring?.userData?.kidsGalaxyRingParticleCount || 0,
            cassiniGap: ring?.userData?.cassiniGap || null,
            distinctSpeeds: new Set(speeds).size,
            ice: layers.some((layer) => layer.userData?.kidsGalaxyRingParticleKind === 'ice'),
            rock: layers.some((layer) => layer.userData?.kidsGalaxyRingParticleKind === 'rock'),
            dust: layers.some((layer) => layer.userData?.kidsGalaxySaturnDust),
          };
        }
        """,
        planet_id,
    )


def crater_state(page, planet_id: str) -> list[dict]:
    return page.evaluate(
        """
        (id) => {
          const p = window.kidsGalaxy.kidPlanets.get(id);
          const craters = [];
          p.mesh.traverse((object) => {
            if (!object.userData?.kidsGalaxyCrater) return;
            let bowl = false;
            let rim = false;
            object.traverse((child) => {
              bowl ||= Boolean(child.geometry?.userData?.kidsGalaxyCraterBowl);
              rim ||= Boolean(child.geometry?.userData?.kidsGalaxyCraterRim);
            });
            craters.push({
              radius: object.userData.radius,
              depth: object.userData.depth,
              bowl,
              rim,
            });
          });
          return craters;
        }
        """,
        planet_id,
    )


def main() -> int:
    FAILURES.clear()
    with Server() as server, sync_playwright() as pw:
        ringed = server.upload(
            "Alpha",
            artwork=kid_style_png_bytes(),
            style="ringed",
            ring_color="#ffffff",
        )
        cratered = server.upload(
            "Beta",
            (40, 220, 40),
            style="cratered",
            crater_color="#73808f",
        )
        mountain = server.upload(
            "Gamma",
            (40, 40, 220),
            style="spiky",
            mountain_color="#d98242",
            companions="astronaut",
        )

        browser = pw.chromium.launch(
            executable_path=chromium_executable(),
            args=["--use-gl=swiftshader", "--enable-unsafe-swiftshader"],
        )
        page = browser.new_page(viewport={"width": 2560, "height": 1440})
        errors: list[str] = []
        # Chrome's console message for a failed request is the bare string
        # "Failed to load resource: the server responded with a status of 404" -
        # no URL, no method, nothing to act on. Three of those told us only that
        # something, somewhere, three times, was missing. Recording the responses
        # alongside gives the next person the URL.
        failed_requests: list[str] = []
        page.on(
            "console",
            lambda message: errors.append(message.text) if message.type == "error" else None,
        )
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on(
            "response",
            lambda response: failed_requests.append(f"{response.status} {response.url}")
            if response.status >= 400
            else None,
        )

        print("\nload and composition")
        page.goto(f"{server.base}/", wait_until="load")
        wait_for(page, "window.kidsGalaxy && window.kidsGalaxy.kidPlanets.size === 3", 12_000)
        wait_for(
            page,
            f"Boolean(window.kidsGalaxy.kidPlanets.get('{ringed}')?.mesh?.material?.userData?.kidsGalaxyManifestStrokeSurface)",
            12_000,
        )
        check(bool(page.evaluate("window.kidsGalaxy")), "projector initializes")
        ids = planet_ids(page)
        check(len(ids) == 3, f"three manifest drawings produce three planets (got {len(ids)})")
        check(len(set(ids)) == len(ids), "SSE priming does not duplicate planets")
        check(set(ids) == {ringed, cratered, mountain}, "stored planet identities are preserved")

        print("\nauthoritative manifest renderer")
        state = core_render_state(page, ringed)
        check(state["qualityProfile"] == "laptop-high", "renderer uses laptop-high profile")
        check(state["widthSegments"] >= 96, "planet sphere uses high-density geometry")
        check(state["heightSegments"] >= 72, "planet sphere has dense vertical tessellation")
        check(state["manifest"], "drawing manifest is loaded before rendering")
        check(state["manifestSurface"], "manifest stroke surface owns planet appearance")
        check(
            state["projectionMode"] == "manifest-strokes-layered-on-body",
            "diagnostics identify the single manifest projection",
        )
        check(state["strokeCount"] == 3, "all authored fixture strokes reach the renderer")
        check(len(state["layerLevels"]) == 3, "each authored stroke receives a relief layer")
        check(state["beveledRelief"], "strokes are raised as real beveled geometry")
        check(
            not state["displacement"] and not state["bump"],
            "no displacement or bump map stacked on already-displaced vertices",
        )
        check(
            state["reliefFraction"] >= 0.02,
            f"paint stands proud of the body ({state['reliefFraction'] * 100:.1f}% of radius)",
        )
        check(
            state["maxNormalTiltDeg"] >= 25,
            "bevel walls carry their own normals, so they shade as walls "
            f"(a smooth sphere reads 0 degrees; this reads {state['maxNormalTiltDeg']:.1f})",
        )
        check(state["occlusionMap"], "creases are shaded by an ambient occlusion map")

        print("\npainted-toy finish")
        check(0.3 <= state["roughness"] <= 0.7, f"body holds a soft sheen ({state['roughness']})")
        check(state["metalness"] == 0, "planet body is not metallic")
        check(state["clearcoat"] > 0, "planet carries a painted-toy coat")
        check(state["roughnessMap"], "raised paint is finished separately from the body")
        check(state["environmentLit"], "planet receives image-based light")
        # 7 is NeutralToneMapping. ACESFilmic (4) desaturates saturated colour on
        # its way to white, which is right for photographic footage and wrong for
        # a planet covered in flat poster paint.
        check(
            state["toneMapping"] == 7,
            f"scene tone maps with Khronos PBR Neutral, not ACES (got {state['toneMapping']})",
        )
        # Exposure is solved against the ACES setting it replaced rather than
        # picked, so drifting off it un-matches the brightness on purpose.
        check(
            abs(state["toneMappingExposure"] - 1.91) < 0.01,
            f"exposure holds the solved match ({state['toneMappingExposure']})",
        )
        check(state["pipeline"][0] == "kid-artwork-upgrade", "render pipeline still exposes its stable first stage")
        check(state["shadows"] and state["sunCastsShadow"], "renderer keeps real shadows")
        check(state["internalWidth"] <= 3840, "internal width stays within the 4K ceiling")
        check(state["internalHeight"] <= 2160, "internal height stays within the 4K ceiling")

        print("\nSaturn particle ring")
        ring = saturn_ring_state(page, ringed)
        check(ring["present"] and ring["solid"] is False, "ring is particulate rather than a solid annulus")
        check(ring["particles"] >= 10_000, "ring contains a dense particle field")
        check(ring["ice"] and ring["rock"] and ring["dust"], "ring contains ice, rock and dust")
        check(ring["differential"] and ring["distinctSpeeds"] >= 3, "ring layers rotate at distinct speeds")
        check(ring["cassiniGap"] and ring["cassiniGap"][1] > ring["cassiniGap"][0], "ring has a Cassini-style gap")

        print("\ndeep crater geometry")
        craters = crater_state(page, cratered)
        check(9 <= len(craters) <= 13, f"crater count remains naturally varied ({len(craters)})")
        depths = [item["depth"] for item in craters]
        radii = [item["radius"] for item in craters]
        check(max(radii) - min(radii) > 0.12, "craters include clearly different sizes")
        check(min(depths) >= 0.09 and max(depths) >= 0.15, "craters retain meaningful depth variation")
        check(all(item["bowl"] and item["rim"] for item in craters), "every crater owns bowl and rim geometry")

        print("\nlive lifecycle")
        before = page.evaluate(
            "Object.fromEntries(Array.from(window.kidsGalaxy.kidPlanets.entries())"
            ".map(([id, p]) => [id, [p.a, p.e, p.i, p.M0]]))"
        )
        fourth = server.upload("Delta", (220, 220, 40))
        wait_for(page, "window.kidsGalaxy.kidPlanets.size === 4")
        check(fourth in planet_ids(page), "live SSE upload appears without reload")
        check(server.delete(cratered) == 200, "DELETE returns 200 in development smoke server")
        wait_for(page, "window.kidsGalaxy.kidPlanets.size === 3")
        check(cratered not in planet_ids(page), "deleted planet leaves the sky")

        before = {key: value for key, value in before.items() if key != cratered}
        page.reload(wait_until="load")
        wait_for(page, "window.kidsGalaxy && window.kidsGalaxy.kidPlanets.size === 3")
        after = page.evaluate(
            "Object.fromEntries(Array.from(window.kidsGalaxy.kidPlanets.entries())"
            ".map(([id, p]) => [id, [p.a, p.e, p.i, p.M0]]))"
        )
        check(before[ringed] == after[ringed], "existing planet orbit remains deterministic after reload")
        check(before[mountain] == after[mountain], "second existing orbit remains deterministic after reload")

        print("\ngallery cap and clear")
        cap = page.evaluate("window.kidsGalaxy.GALLERY_SIZE")
        oldest_remaining = ringed
        for index in range(cap):
            server.upload(f"Filler {index}")
        wait_for(page, f"window.kidsGalaxy.kidPlanets.size === {cap}", timeout_ms=20_000)
        ids = planet_ids(page)
        check(len(ids) == cap, f"sky is capped at {cap} planets (got {len(ids)})")
        check(oldest_remaining not in ids, "oldest planet is evicted at the gallery cap")
        check(server.clear() == 200, "clear-all returns 200 in development smoke server")
        wait_for(page, "window.kidsGalaxy.kidPlanets.size === 0")
        check(planet_ids(page) == [], "clear event empties the whole sky")
        server.upload("After The Clear")
        wait_for(page, "window.kidsGalaxy.kidPlanets.size === 1")
        check(len(planet_ids(page)) == 1, "planets can arrive again after clear")

        print("\nconsole")
        check(
            errors == [],
            f"no browser console errors ({errors[:3]}"
            + (f" | failed requests: {failed_requests[:5]}" if failed_requests else "")
            + ")",
        )
        browser.close()

    print()
    if FAILURES:
        print(f"{len(FAILURES)} check(s) failed:")
        for failure in FAILURES:
            print(f"  - {failure}")
        return 1
    print("projector smoke test passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
