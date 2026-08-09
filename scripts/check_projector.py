#!/usr/bin/env python3
"""Real-browser smoke test for the laptop-powered projector page.

The projector depends on WebGL, EventSource and the live FastAPI server, so
this test drives the real page in headless Chromium. It protects the sculpted
toy rendering contract, holiday substitutions, deep crater geometry and the
manager-controlled galaxy environment.
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
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def png_bytes(colour: tuple[int, int, int]) -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", (64, 64), colour).save(buffer, format="PNG")
    return buffer.getvalue()


def kid_style_png_bytes() -> bytes:
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
    def __init__(self) -> None:
        self.port = free_port()
        self.root = Path(tempfile.mkdtemp(prefix="kg-projector-"))
        self.uploads = self.root / "uploads"
        self.state = self.root / "state"
        self.base = f"http://127.0.0.1:{self.port}"
        self._process: subprocess.Popen | None = None

    def __enter__(self) -> "Server":
        env = {
            "PATH": "/usr/bin:/bin:/usr/local/bin",
            "PYTHONPATH": str(SERVER_DIR),
            "UPLOAD_DIR": str(self.uploads),
            "STATE_DIR": str(self.state),
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
        shutil.rmtree(self.root, ignore_errors=True)

    def upload(
        self,
        name: str,
        colour: tuple[int, int, int] = (200, 30, 30),
        artwork: bytes | None = None,
        **design: str,
    ) -> str:
        response = httpx.post(
            f"{self.base}/api/upload",
            files={
                "file": (
                    "planet.png",
                    artwork if artwork is not None else png_bytes(colour),
                    "image/png",
                )
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


def force_space_activity(page) -> None:
    page.evaluate(
        "(() => { const env = window.kidsGalaxy.engine.environment;"
        "env.nextCometAt = 0; env.nextFlybyAt = 0; env.update(env.lastTime + 0.05); })()"
    )


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
            companions="astronaut",
        )

        browser = pw.chromium.launch(
            args=["--use-gl=swiftshader", "--enable-unsafe-swiftshader"]
        )
        page = browser.new_page(viewport={"width": 2560, "height": 1440})
        errors: list[str] = []
        page.on(
            "console",
            lambda message: errors.append(message.text) if message.type == "error" else None,
        )
        page.on("pageerror", lambda error: errors.append(str(error)))

        print("\nload")
        page.goto(f"{server.base}/", wait_until="load")
        wait_for(page, "window.kidsGalaxy && window.kidsGalaxy.kidPlanets.size === 3")
        initialized = page.evaluate("Boolean(window.kidsGalaxy)")
        check(initialized, f"projector initializes without a fatal browser error ({errors[:3]})")
        if not initialized:
            browser.close()
            return 1

        wait_for(
            page,
            f"(() => {{ const v = window.kidsGalaxy.kidPlanets.get('{first}'); "
            "return v?.accentEdgeMesh?.material.alphaMap && v?.accentMesh?.material.alphaMap; })()",
        )
        ids = planet_ids(page)
        check(len(ids) == 3, f"three stored drawings produce three planets (got {len(ids)})")
        check(len(set(ids)) == len(ids), "SSE priming does not duplicate planets")
        check(set(ids) == {first, second, third}, "stored planet identities are preserved")

        print("\nlaptop-high sculpted renderer")
        polished = page.evaluate(
            f"(() => {{"
            f"const p = window.kidsGalaxy.kidPlanets.get('{first}');"
            "const g = window.kidsGalaxy.engine.galaxyScene;"
            "const edge = p.accentEdgeMesh; const top = p.accentMesh;"
            "return {"
            "material: p.mesh.material.type, baseRadius: p.mesh.geometry.parameters.radius,"
            "widthSegments: p.mesh.geometry.parameters.widthSegments,"
            "heightSegments: p.mesh.geometry.parameters.heightSegments,"
            "baseHasFlatTexture: Boolean(p.mesh.material.map),"
            "baseHasDisplacement: Boolean(p.mesh.material.displacementMap),"
            "edgeVisible: edge.visible, edgeRadius: edge.geometry.parameters.radius,"
            "edgeAlphaTest: edge.material.alphaTest, topVisible: top.visible,"
            "topRadius: top.geometry.parameters.radius, topAlphaTest: top.material.alphaTest,"
            "topHasColour: Boolean(top.material.map), topHasMask: Boolean(top.material.alphaMap),"
            "emissive: p.mesh.material.emissiveIntensity, sunType: g.sunLight.type,"
            "sunIntensity: g.sunLight.intensity, ambientIntensity: g.ambientLight.intensity,"
            "fillIntensity: g.fillLight.intensity, exposure: g.renderer.toneMappingExposure,"
            "shadows: g.renderer.shadowMap.enabled, sunCastsShadow: g.sunLight.castShadow,"
            "shadowSize: g.sunLight.shadow.mapSize.width,"
            "qualityProfile: g.renderer.userData.kidsGalaxyQualityProfile,"
            "renderScale: g.renderer.userData.kidsGalaxyRenderScale,"
            "internalWidth: g.renderer.userData.kidsGalaxyInternalWidth,"
            "internalHeight: g.renderer.userData.kidsGalaxyInternalHeight"
            "}; })()"
        )
        check(polished["qualityProfile"] == "laptop-high", "renderer uses laptop-high profile")
        check(polished["material"] == "MeshPhysicalMaterial", "planet body uses physical material")
        check(polished["widthSegments"] >= 96, "planet sphere uses high-density geometry")
        check(polished["heightSegments"] >= 72, "planet sphere has dense vertical tessellation")
        check(not polished["baseHasFlatTexture"], "child PNG is not flat-wrapped over the sphere")
        check(not polished["baseHasDisplacement"], "paint does not inflate the base sphere")
        check(polished["edgeVisible"] and polished["topVisible"], "molded artwork has shoulder and top")
        check(
            polished["baseRadius"] < polished["edgeRadius"] < polished["topRadius"],
            "molded shoulder sits between body and colour top",
        )
        check(polished["edgeAlphaTest"] < polished["topAlphaTest"], "shoulder is broader than top")
        check(polished["topHasColour"] and polished["topHasMask"], "raised top carries kid colours")
        check(polished["emissive"] == 0, "planet remains lit instead of self-emitting")
        check(polished["sunType"] == "PointLight", "galaxy sun owns the physical key light")
        check(polished["shadows"] and polished["sunCastsShadow"], "laptop renderer enables real shadows")
        check(polished["shadowSize"] >= 2048, "sun shadow map uses laptop-grade resolution")
        check(polished["renderScale"] >= 1, "1440p viewport renders at native resolution")
        check(polished["internalWidth"] <= 3840, "internal width supports up to 4K")
        check(polished["internalHeight"] <= 2160, "internal height supports up to 4K")

        print("\nsolid sculpted planet ring")
        ring_details = page.evaluate(
            f"(() => {{"
            f"const e = window.kidsGalaxy.kidPlanets.get('{first}');"
            "const ring = e.decorations[0]; const geometry = ring.geometry;"
            "const positions = geometry.getAttribute('position'); const colors = geometry.getAttribute('color');"
            "let minZ = Infinity; let maxZ = -Infinity; let minL = 1; let maxL = 0;"
            "for (let i = 0; i < positions.count; i += 1) {"
            "minZ = Math.min(minZ, positions.getZ(i)); maxZ = Math.max(maxZ, positions.getZ(i));"
            "if (colors) { const l = (colors.getX(i) + colors.getY(i) + colors.getZ(i)) / 3;"
            "minL = Math.min(minL, l); maxL = Math.max(maxL, l); }}"
            "let particulate = false; ring.traverse((o) => {"
            "if (o.userData?.kidsGalaxyRockRing || o.userData?.kidsGalaxyRingDust) particulate = true; });"
            "return { type: geometry.type, sculpted: Boolean(geometry.userData.kidsGalaxySculptedRing),"
            "beveled: Boolean(geometry.userData.kidsGalaxyRingBeveled),"
            "declaredThickness: geometry.userData.thickness, measuredThickness: maxZ - minZ,"
            "segments: geometry.userData.radialSegments, wobble: geometry.userData.wobbleAmplitude,"
            "lightnessSpread: maxL - minL, particulate, castShadow: ring.castShadow }; })()"
        )
        check(ring_details["type"] == "ExtrudeGeometry", "planet ring is a continuous solid extrusion")
        check(ring_details["sculpted"] and ring_details["beveled"], "ring is a rounded molded object")
        check(not ring_details["particulate"], "planet ring contains no rock or dust field")
        check(ring_details["declaredThickness"] >= 0.12, "ring is visibly thicker")
        check(ring_details["measuredThickness"] >= 0.12, "rendered ring exposes real edge depth")
        check(ring_details["segments"] >= 256, "ring silhouette uses high-density geometry")
        check(ring_details["wobble"] <= 0.04, "ring keeps only subtle organic variation")
        check(ring_details["lightnessSpread"] > 0.05, "white rings reveal rounded form")
        check(ring_details["castShadow"], "solid ring participates in real lighting")

        print("\ndeep varied craters")
        craters = page.evaluate(
            f"(() => {{ const e = window.kidsGalaxy.kidPlanets.get('{second}');"
            "const list = []; e.mesh.traverse((o) => { if (o.userData?.kidsGalaxyCrater) {"
            "let bowl = null; let rim = null; o.traverse((c) => {"
            "if (c.geometry?.userData?.kidsGalaxyCraterBowl) bowl = c.geometry.userData;"
            "if (c.geometry?.userData?.kidsGalaxyCraterRim) rim = c.geometry.userData; });"
            "list.push({ ...o.userData, bowl, rim }); }}); return list; })()"
        )
        check(9 <= len(craters) <= 13, f"crater count is naturally varied ({len(craters)})")
        radii = [item["radius"] for item in craters]
        depths = [item["depth"] for item in craters]
        aspects = [item["aspectRatio"] for item in craters]
        check(max(radii) - min(radii) > 0.12, "craters include clearly different sizes")
        check(min(depths) >= 0.09, "even smaller craters are meaningfully recessed")
        check(max(depths) >= 0.15, "hero craters are substantially deeper than the old design")
        check(max(aspects) - min(aspects) > 0.08, "craters vary from round to oval")
        check(all(item["bowl"] and item["rim"] for item in craters), "every crater owns bowl and irregular rim geometry")
        check(
            any(item["bowl"]["irregularity"] >= 0.04 for item in craters),
            "crater outlines include non-circular irregularity",
        )

        print("\ndefault mountain terrain")
        mountain_ranges = page.evaluate(
            f"(() => {{ const e = window.kidsGalaxy.kidPlanets.get('{third}');"
            "const ranges = []; e.mesh.traverse((o) => {"
            "if (o.geometry?.userData?.kidsGalaxyMountainRange) ranges.push(o.geometry.userData);"
            "}); return ranges; })()"
        )
        check(len(mountain_ranges) >= 5, "default mountain planet owns several terrain ranges")

        print("\nhalloween substitutions")
        server.update_behavior(
            mode="manual",
            manual_theme="halloween",
            enabled_themes=["halloween", "easter", "christmas"],
            asteroid_belt_enabled=True,
            comets_enabled=True,
            comet_frequency="frequent",
            flyby_asteroids_enabled=True,
            flyby_frequency="frequent",
        )
        wait_for(page, "window.kidsGalaxy.engine.behaviorController.current?.theme === 'halloween'")
        wait_for(page, "window.kidsGalaxy.engine.environment.asteroidBelt?.userData?.kidsGalaxyAsteroidStyle === 'pumpkin'")
        force_space_activity(page)
        halloween = page.evaluate(
            f"(() => {{ const env = window.kidsGalaxy.engine.environment;"
            f"const planet = window.kidsGalaxy.kidPlanets.get('{third}');"
            "const body = env.asteroidBelt?.children.find((o) => o.userData?.kidsGalaxyThemedAsteroids);"
            "const stems = env.asteroidBelt?.children.find((o) => o.userData?.kidsGalaxyPumpkinStems);"
            "const flyby = env.flybys[0]?.group; const astronaut = planet.companions.find((r) => r.type === 'astronaut');"
            "const comet = env.comets[0]; let sunAlignment = 0; if (comet) {"
            "const tailAxis = comet.tail.up.clone().applyQuaternion(comet.tail.quaternion).normalize();"
            "const sunward = comet.head.position.clone().normalize().multiplyScalar(-1);"
            "sunAlignment = tailAxis.dot(sunward); }"
            "return { beltStyle: env.asteroidBelt?.userData?.kidsGalaxyAsteroidStyle,"
            "bodyStyle: body?.userData?.kidsGalaxyAsteroidStyle, stems: Boolean(stems),"
            "flybyStyle: flyby?.userData?.kidsGalaxyAsteroidStyle,"
            "witch: Boolean(astronaut?.object?.userData?.kidsGalaxyWitchOnBroom),"
            "comets: env.comets.length, sunAlignment }; })()"
        )
        check(halloween["beltStyle"] == "pumpkin", "Halloween asteroid belt becomes pumpkins")
        check(halloween["bodyStyle"] == "pumpkin" and halloween["stems"], "pumpkins have sculpted bodies and stems")
        check(halloween["flybyStyle"] == "pumpkin", "Halloween fly-by asteroids become pumpkins")
        check(halloween["witch"], "astronaut companion becomes a witch on a broom")
        check(halloween["comets"] >= 1, "comets still spawn under Halloween")
        check(halloween["sunAlignment"] > 0.995, "comet tail remains anti-solar")

        print("\nchristmas substitutions")
        server.update_behavior(
            mode="manual",
            manual_theme="christmas",
            enabled_themes=["halloween", "easter", "christmas"],
            asteroid_belt_enabled=True,
            comets_enabled=True,
            flyby_asteroids_enabled=True,
            flyby_frequency="frequent",
        )
        wait_for(page, "window.kidsGalaxy.engine.behaviorController.current?.theme === 'christmas'")
        wait_for(page, "window.kidsGalaxy.engine.environment.asteroidBelt?.userData?.kidsGalaxyAsteroidStyle === 'snowball'")
        wait_for(
            page,
            f"(() => {{ const e = window.kidsGalaxy.kidPlanets.get('{third}');"
            "let trees = 0; e.mesh.traverse((o) => { if (o.userData?.kidsGalaxyChristmasTree) trees += 1; });"
            "return trees >= 12; })()",
        )
        force_space_activity(page)
        christmas = page.evaluate(
            f"(() => {{ const env = window.kidsGalaxy.engine.environment;"
            f"const planet = window.kidsGalaxy.kidPlanets.get('{third}');"
            "const body = env.asteroidBelt?.children.find((o) => o.userData?.kidsGalaxyThemedAsteroids);"
            "const flyby = env.flybys[0]?.group; let trees = 0; let mountains = 0;"
            "planet.mesh.traverse((o) => { if (o.userData?.kidsGalaxyChristmasTree) trees += 1;"
            "if (o.geometry?.userData?.kidsGalaxyMountainRange) mountains += 1; });"
            "const astronaut = planet.companions.find((r) => r.type === 'astronaut');"
            "return { beltStyle: env.asteroidBelt?.userData?.kidsGalaxyAsteroidStyle,"
            "bodyStyle: body?.userData?.kidsGalaxyAsteroidStyle, flybyStyle: flyby?.userData?.kidsGalaxyAsteroidStyle,"
            "trees, mountains, witch: Boolean(astronaut?.object?.userData?.kidsGalaxyWitchOnBroom) }; })()"
        )
        check(christmas["beltStyle"] == "snowball", "Christmas asteroid belt becomes snowballs")
        check(christmas["bodyStyle"] == "snowball", "Christmas belt uses sculpted snowball geometry")
        check(christmas["flybyStyle"] == "snowball", "Christmas fly-bys become snowballs")
        check(christmas["trees"] >= 12, "Christmas mountain planets grow clusters of trees")
        check(christmas["mountains"] == 0, "Christmas trees replace mountain geometry instead of layering over it")
        check(not christmas["witch"], "witch companion returns to astronaut outside Halloween")

        server.update_behavior(
            mode="manual",
            manual_theme="default",
            asteroid_belt_enabled=False,
            comets_enabled=False,
            flyby_asteroids_enabled=False,
        )
        wait_for(
            page,
            "(() => { const e = window.kidsGalaxy.engine.environment;"
            "return !e.asteroidBelt && e.comets.length === 0 && e.flybys.length === 0; })()",
        )
        check(
            page.evaluate(
                "(() => { const e = window.kidsGalaxy.engine.environment;"
                "return !e.asteroidBelt && e.comets.length === 0 && e.flybys.length === 0; })()"
            ),
            "admin can disable all optional space activity live",
        )

        print("\nlive arrival and deletion over SSE")
        fourth = server.upload("Delta", (220, 220, 40))
        wait_for(page, "window.kidsGalaxy.kidPlanets.size === 4")
        check(fourth in planet_ids(page), "a live upload appears without reload")
        check(server.delete(second) == 200, "DELETE returns 200")
        wait_for(page, "window.kidsGalaxy.kidPlanets.size === 3")
        check(second not in planet_ids(page), "deleted planet leaves the sky")

        print("\norbit determinism across reload")
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
        check(before == after, "every planet keeps the same orbit after reload")

        print("\ngallery cap and clear")
        cap = page.evaluate("window.kidsGalaxy.GALLERY_SIZE")
        oldest_remaining = first
        for index in range(cap):
            server.upload(f"Filler {index}")
        wait_for(page, f"window.kidsGalaxy.kidPlanets.size === {cap}", timeout_ms=20000)
        ids = planet_ids(page)
        check(len(ids) == cap, f"sky is capped at {cap} planets (got {len(ids)})")
        check(oldest_remaining not in ids, "oldest planet is evicted at the gallery cap")

        check(server.clear() == 200, "DELETE /api/planets returns 200")
        wait_for(page, "window.kidsGalaxy.kidPlanets.size === 0")
        check(planet_ids(page) == [], "clear event empties the whole sky")
        server.upload("After The Clear")
        wait_for(page, "window.kidsGalaxy.kidPlanets.size === 1")
        check(len(planet_ids(page)) == 1, "planets can arrive again after clear")

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
