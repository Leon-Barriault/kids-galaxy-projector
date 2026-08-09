#!/usr/bin/env python3
"""
Smoke test for the projector page.

`static/galaxy.js` needs a WebGL context, a live server and a real EventSource,
so this drives the real page in headless Chromium against a real server. It
asserts the behaviours that have actually broken before, plus the Pi-friendly
sculpted renderer contract:

  * a page load produces exactly one planet per stored drawing
  * kid drawings become a coherent body plus limited raised accent shapes
  * the child's full PNG is never wrapped flat over the whole globe
  * sun orbit guides stay smooth while only a ringed planet owns ring wobble
  * the actual galaxy sun is the dominant directional lighting reference
  * ringed planets own a wide flat, graded, gently wobbled ring
  * cratered planets own recessed bowl/rim geometry
  * mountain planets own varied terrain-range geometry, not identical spikes
  * the polished path does not enable expensive real-time shadow maps
  * a larger-than-1080p display still renders internally at at most 1080p
  * live upload/delete/reload/gallery/clear behaviour remains intact
  * nothing is logged to the console as an error

Run it with `make check-projector` (needs playwright + chromium). Projector CI
runs the same check with SwiftShader so browser-only Three.js regressions block
main even though the field device uses the Pi GPU.
"""

from __future__ import annotations

import io
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


def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def png_bytes(colour: tuple[int, int, int]) -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", (64, 64), colour).save(buffer, format="PNG")
    return buffer.getvalue()


def kid_style_png_bytes() -> bytes:
    """A filled multicolour drawing that should become body + a few accents."""
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
    draw.ellipse((8, 27, 18, 35), fill=(76, 175, 80))
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


class Server:
    """uvicorn against a throwaway upload directory."""

    def __init__(self) -> None:
        self.port = free_port()
        self.uploads = Path(tempfile.mkdtemp(prefix="kg-projector-"))
        self.base = f"http://127.0.0.1:{self.port}"
        self._process: subprocess.Popen | None = None

    def __enter__(self) -> "Server":
        env = {
            "PATH": "/usr/bin:/bin:/usr/local/bin",
            "PYTHONPATH": str(SERVER_DIR),
            "UPLOAD_DIR": str(self.uploads),
            "STATIC_DIR": str(SERVER_DIR / "static"),
            "RATE_LIMIT_SECONDS": "0",
            "ENVIRONMENT": "development",
        }
        self._process = subprocess.Popen(
            [sys.executable, "-m", "uvicorn", "main:app", "--port", str(self.port)],
            cwd=SERVER_DIR,
            env=env,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        deadline = time.time() + 30
        while time.time() < deadline:
            try:
                if httpx.get(f"{self.base}/health", timeout=1).status_code == 200:
                    return self
            except httpx.HTTPError:
                time.sleep(0.2)
        raise RuntimeError("server did not start")

    def __exit__(self, *_exc: object) -> None:
        if self._process:
            self._process.terminate()
            self._process.wait(timeout=10)
        shutil.rmtree(self.uploads, ignore_errors=True)

    def upload(
        self,
        name: str,
        colour: tuple[int, int, int] = (200, 30, 30),
        artwork: bytes | None = None,
        **design: str,
    ) -> str:
        data = {"name": name, **design}
        payload = artwork if artwork is not None else png_bytes(colour)
        response = httpx.post(
            f"{self.base}/api/upload",
            files={"file": ("planet.png", payload, "image/png")},
            data=data,
            timeout=10,
        )
        response.raise_for_status()
        return response.json()["planet_id"]

    def delete(self, planet_id: str) -> int:
        return httpx.delete(f"{self.base}/api/planets/{planet_id}", timeout=10).status_code

    def clear(self) -> int:
        return httpx.delete(f"{self.base}/api/planets", timeout=10).status_code


FAILURES: list[str] = []


def check(condition: bool, description: str) -> None:
    print(f"  {'PASS' if condition else 'FAIL'}  {description}")
    if not condition:
        FAILURES.append(description)


def wait_for(page, expression: str, timeout_ms: int = 8000) -> None:
    try:
        page.wait_for_function(expression, timeout=timeout_ms)
    except Exception:  # noqa: BLE001 - the assertion below reports the detail
        pass


def planet_ids(page) -> list[str]:
    return page.evaluate("Array.from(window.kidsGalaxy.kidPlanets.keys())")


def main() -> int:
    with Server() as server, sync_playwright() as pw:
        first = server.upload(
            "Alpha",
            artwork=kid_style_png_bytes(),
            style="ringed",
            ring_color="#ffffff",
        )
        second = server.upload(
            "Beta",
            (40, 220, 40),
            style="cratered",
            crater_color="#73808f",
        )
        third = server.upload(
            "Gamma",
            (40, 40, 220),
            style="spiky",
            mountain_color="#d98242",
        )

        browser = pw.chromium.launch(args=["--use-gl=swiftshader", "--enable-unsafe-swiftshader"])
        page = browser.new_page(viewport={"width": 2560, "height": 1440})
        errors: list[str] = []
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append(str(e)))

        print("\nload")
        page.goto(f"{server.base}/", wait_until="load")
        wait_for(page, "window.kidsGalaxy && window.kidsGalaxy.kidPlanets.size === 3")
        initialized = page.evaluate("Boolean(window.kidsGalaxy)")
        check(initialized, f"projector initializes without a fatal browser error ({errors[:3]})")
        if not initialized:
            print(f"  Browser errors: {errors}")
            browser.close()
            return 1

        wait_for(
            page,
            f"(() => {{ const v = window.kidsGalaxy.kidPlanets.get('{first}'); "
            "return v && v.accentMesh && v.accentMesh.material.alphaMap; }})()",
        )
        ids = planet_ids(page)
        check(len(ids) == 3, f"three stored drawings produce three planets (got {len(ids)})")
        check(len(set(ids)) == len(ids), "no duplicate planet is created by the SSE priming frame")
        check(set(ids) == {first, second, third}, "the three planets are the three that were stored")

        print("\nsculpted Pi renderer")
        polished = page.evaluate(
            f"(() => {{"
            f"const p = window.kidsGalaxy.kidPlanets.get('{first}');"
            "const g = window.kidsGalaxy.engine.galaxyScene;"
            "const a = p.accentMesh;"
            "const alphaCanvas = a.material.alphaMap?.image;"
            "let coverage = 0;"
            "if (alphaCanvas?.getContext) {"
            "const context = alphaCanvas.getContext('2d');"
            "const pixels = context.getImageData(0, 0, alphaCanvas.width, alphaCanvas.height).data;"
            "let on = 0;"
            "for (let i = 0; i < pixels.length; i += 4) { if (pixels[i] > 96) on += 1; }"
            "coverage = on / (pixels.length / 4);"
            "}"
            "return {"
            "material: p.mesh.material.type,"
            "baseHasFlatTexture: Boolean(p.mesh.material.map),"
            "baseHasDisplacement: Boolean(p.mesh.material.displacementMap),"
            "accentVisible: a.visible,"
            "accentMaterial: a.material.type,"
            "accentHasColour: Boolean(a.material.map),"
            "accentHasMask: Boolean(a.material.alphaMap),"
            "accentHasBump: Boolean(a.material.bumpMap),"
            "accentHasDisplacement: Boolean(a.material.displacementMap),"
            "accentBumpScale: a.material.bumpScale,"
            "accentDisplacementScale: a.material.displacementScale,"
            "accentRadius: a.geometry.parameters.radius,"
            "accentCoverage: coverage,"
            "emissive: p.mesh.material.emissiveIntensity,"
            "sunType: g.sunLight.type,"
            "sunIntensity: g.sunLight.intensity,"
            "ambientIntensity: g.ambientLight.intensity,"
            "fillIntensity: g.fillLight.intensity,"
            "exposure: g.renderer.toneMappingExposure,"
            "shadows: g.renderer.shadowMap.enabled,"
            "renderScale: g.renderer.userData.kidsGalaxyRenderScale,"
            "internalWidth: g.renderer.userData.kidsGalaxyInternalWidth,"
            "internalHeight: g.renderer.userData.kidsGalaxyInternalHeight"
            "};"
            "})()"
        )
        check(polished["material"] == "MeshPhysicalMaterial", "planet body uses physical material")
        check(not polished["baseHasFlatTexture"], "child PNG is not wrapped flat onto the base sphere")
        check(
            not polished["baseHasDisplacement"],
            "base sphere stays coherent instead of inflating under paint",
        )
        check(polished["accentVisible"], "kid drawing produces a separate raised accent shell")
        check(
            polished["accentMaterial"] == "MeshPhysicalMaterial",
            "raised artwork uses physical toy material",
        )
        check(polished["accentHasColour"], "raised shell carries interpreted kid colours")
        check(polished["accentHasMask"], "raised shell is cut to simplified accent shapes")
        check(polished["accentHasBump"], "accent edges have molded normal depth")
        check(polished["accentHasDisplacement"], "accent shapes have real geometric height")
        check(polished["accentBumpScale"] >= 0.07, "molded shoulders are visually pronounced")
        check(
            polished["accentDisplacementScale"] >= 0.045,
            "colour ribbons stand clearly above the planet body",
        )
        check(polished["accentRadius"] > 1.08, "artwork shell sits visibly proud of the base sphere")
        check(
            0.05 <= polished["accentCoverage"] <= 0.45,
            f"drawing is interpreted as limited accents, not full coverage ({polished['accentCoverage']:.2f})",
        )
        check(polished["emissive"] == 0, "planet is not flattened by self-emission")
        check(polished["sunType"] == "PointLight", "galaxy sun owns the physical key light")
        check(
            polished["sunIntensity"] > polished["ambientIntensity"] + polished["fillIntensity"],
            "sun is stronger than the non-directional readability fill",
        )
        check(polished["exposure"] >= 1.4, "projector exposure keeps kid colours easy to see")
        check(not polished["shadows"], "renderer avoids expensive real-time shadow maps")
        check(polished["renderScale"] < 1, "large viewport is rendered below native resolution")
        check(polished["internalWidth"] <= 1920, "internal render width is capped at 1920")
        check(polished["internalHeight"] <= 1080, "internal render height is capped at 1080")

        print("\nring and orbit separation")
        ring_details = page.evaluate(
            f"(() => {{"
            f"const e = window.kidsGalaxy.kidPlanets.get('{first}');"
            "const ring = e.decorations[0];"
            "const orbit = e.ring;"
            "const colors = ring.geometry.getAttribute('color');"
            "let min = 1; let max = 0;"
            "for (let i = 0; i < colors.count; i += 1) {"
            "const lightness = (colors.getX(i) + colors.getY(i) + colors.getZ(i)) / 3;"
            "min = Math.min(min, lightness); max = Math.max(max, lightness);"
            "}"
            "return {"
            "type: ring.geometry.type,"
            "inner: ring.geometry.userData.innerRadius,"
            "outer: ring.geometry.userData.outerRadius,"
            "hasGradient: Boolean(colors),"
            "hasWobble: Boolean(ring.geometry.userData.kidsGalaxyRingWobble),"
            "wobbleAmplitude: ring.geometry.userData.wobbleAmplitude,"
            "vertexColors: ring.material.vertexColors,"
            "spread: max - min,"
            "orbitGuide: Boolean(orbit.geometry.userData.kidsGalaxyOrbitGuide),"
            "orbitWobble: Boolean(orbit.geometry.userData.kidsGalaxyRingWobble)"
            "};"
            "})()"
        )
        check(ring_details["type"] == "RingGeometry", "planet ring is a flat annular band")
        check(ring_details["outer"] - ring_details["inner"] >= 0.8, "planet ring is visibly wide")
        check(ring_details["hasGradient"], "planet ring carries radial colour gradation")
        check(ring_details["hasWobble"], "only the planet ring owns the handmade wobble")
        check(ring_details["wobbleAmplitude"] < 0.04, "planet ring wobble remains subtle")
        check(ring_details["vertexColors"], "planet ring displays the colour gradation")
        check(ring_details["spread"] > 0.12, "white planet rings retain dark-to-light contrast")
        check(ring_details["orbitGuide"], "sun orbit path is explicitly a smooth orbit guide")
        check(not ring_details["orbitWobble"], "sun orbit guide never receives ring wobble")

        crater_geometry = page.evaluate(
            f"(() => {{"
            f"const e = window.kidsGalaxy.kidPlanets.get('{second}');"
            "const types = [];"
            "e.mesh.traverse((o) => { if (o.geometry) types.push(o.geometry.type); });"
            "return types;"
            "})()"
        )
        check("TorusGeometry" in crater_geometry, "craters have raised rounded rims")
        check(
            crater_geometry.count("BufferGeometry") >= 5,
            "craters have independent recessed bowl surfaces",
        )

        mountain_ranges = page.evaluate(
            f"(() => {{"
            f"const e = window.kidsGalaxy.kidPlanets.get('{third}');"
            "const ranges = [];"
            "e.mesh.traverse((o) => {"
            "if (o.geometry?.userData?.kidsGalaxyMountainRange) {"
            "ranges.push({"
            "width: o.geometry.userData.width,"
            "depth: o.geometry.userData.depth,"
            "height: o.geometry.userData.height,"
            "hasColors: Boolean(o.geometry.getAttribute('color'))"
            "});"
            "}"
            "});"
            "return ranges;"
            "})()"
        )
        check(len(mountain_ranges) >= 5, "mountain planet owns several separate terrain ranges")
        check(
            len({round(item["width"], 2) for item in mountain_ranges}) >= 4,
            "mountain ranges have varied footprints",
        )
        check(
            len({round(item["height"], 2) for item in mountain_ranges}) >= 4,
            "mountain ranges have varied heights",
        )
        check(all(item["hasColors"] for item in mountain_ranges), "mountain crests have tonal accents")

        print("\nlive arrival over SSE")
        fourth = server.upload("Delta", (220, 220, 40))
        wait_for(page, "window.kidsGalaxy.kidPlanets.size === 4")
        check(fourth in planet_ids(page), "a planet uploaded while the page is open appears")

        print("\ndeletion over SSE")
        check(server.delete(second) == 200, "DELETE returns 200")
        wait_for(page, "window.kidsGalaxy.kidPlanets.size === 3")
        check(second not in planet_ids(page), "the deleted planet leaves the sky")
        check(first in planet_ids(page), "the other planets are untouched")

        print("\norbit determinism across a reload")
        before = page.evaluate(
            "Object.fromEntries(Array.from(window.kidsGalaxy.kidPlanets.entries())"
            ".map(([k, v]) => [k, [v.a, v.e, v.i, v.M0]]))"
        )
        page.reload(wait_until="load")
        wait_for(page, "window.kidsGalaxy && window.kidsGalaxy.kidPlanets.size === 3")
        after = page.evaluate(
            "Object.fromEntries(Array.from(window.kidsGalaxy.kidPlanets.entries())"
            ".map(([k, v]) => [k, [v.a, v.e, v.i, v.M0]]))"
        )
        check(before == after, "every planet keeps the same orbit after a reload")

        print("\ngallery cap and eviction order")
        cap = page.evaluate("window.kidsGalaxy.GALLERY_SIZE")
        oldest_remaining = first
        for i in range(cap):
            server.upload(f"Filler {i}")
        wait_for(page, f"window.kidsGalaxy.kidPlanets.size === {cap}", timeout_ms=20000)
        ids = planet_ids(page)
        check(len(ids) == cap, f"the sky is capped at {cap} planets (got {len(ids)})")
        check(oldest_remaining not in ids, "the oldest planet is the one evicted")

        print("\nclear all")
        check(server.clear() == 200, "DELETE /api/planets returns 200")
        wait_for(page, "window.kidsGalaxy.kidPlanets.size === 0")
        check(planet_ids(page) == [], "the whole sky empties on one clear event")
        server.upload("After The Clear")
        wait_for(page, "window.kidsGalaxy.kidPlanets.size === 1")
        check(len(planet_ids(page)) == 1, "planets can arrive again afterwards")

        print("\nconsole")
        check(errors == [], f"no console errors ({errors[:3]})")

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
