#!/usr/bin/env python3
"""Headless frames of Christmas mode: Santa, the gift satellite, and ornaments.

Writes PNGs for review. Not a CI gate — check_seasonal_themes.py owns the
contract. Point KIDS_GALAXY_CHROMIUM at a Chrome build when Playwright's
browser has not been downloaded.
"""

from __future__ import annotations

import base64
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

from check_projector import Server, chromium_executable

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_OUT = REPO_ROOT / "artifacts" / "christmas"


FRAME_SCRIPT = """
() => {
  const kg = window.kidsGalaxy;
  const camera = kg.engine.cameraController.camera;
  const controls = kg.engine.cameraController.controls;
  controls.autoRotate = false;
  controls.enableDamping = false;
  controls.minDistance = 0.02;
  controls.maxDistance = 90;

  const hide = (id) => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  };
  hide('ui');
  hide('hint');
  hide('sparkles');
  hide('celebration');
  hide('shuttle-pointer');

  const planet = kg.kidPlanets.get(window.__christmasPlanetId);
  planet.n = 0;
  planet.spin = 0;
  planet.companions.forEach((record) => {
    record.speed = 0;
  });

  const scratch = () => camera.position.clone();
  const focusOf = (object) => object.getWorldPosition(scratch());

  function frame(point, offset) {
    camera.position.set(point.x + offset.x, point.y + offset.y, point.z + offset.z);
    controls.target.set(point.x, point.y, point.z);
    controls.update();
  }

  function companionOffset(object, distance) {
    const planetPos = focusOf(planet.mesh);
    const focus = focusOf(object);
    const outward = focus.clone().sub(planetPos);
    if (outward.lengthSq() < 1e-6) outward.set(0, 0.2, 1);
    outward.normalize();
    const side = camera.up.clone().cross(outward);
    if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
    side.normalize();
    const offset = outward.multiplyScalar(distance);
    offset.add(side.multiplyScalar(distance * 0.42));
    offset.add(camera.up.clone().multiplyScalar(distance * 0.28));
    return { focus, offset };
  }

  function frameCompanion(object, distance) {
    const { focus, offset } = companionOffset(object, distance);
    frame(focus, offset);
    return { x: focus.x, y: focus.y, z: focus.z };
  }

  const astronaut = planet.companions.find((record) => record.type === 'astronaut').object;
  const satellite = planet.companions.find((record) => record.type === 'satellite').object;
  window.__christmasFrames = {
    santa: () => frameCompanion(astronaut, 1.55),
    gift: () => frameCompanion(satellite, 1.45),
    pair: () => {
      const santaPos = focusOf(astronaut);
      const giftPos = focusOf(satellite);
      const mid = santaPos.clone().add(giftPos).multiplyScalar(0.5);
      const planetPos = focusOf(planet.mesh);
      const outward = mid.clone().sub(planetPos);
      if (outward.lengthSq() < 1e-6) outward.set(0, 0.2, 1);
      outward.normalize();
      const offset = outward.multiplyScalar(4.4);
      offset.add(camera.up.clone().multiplyScalar(0.7));
      frame(mid, offset);
    },
    ornament: () => {
      let mesh = null;
      kg.engine.environment.asteroidBelt?.traverse((object) => {
        if (object.userData?.kidsGalaxyThemedAsteroids && object.userData?.kidsGalaxyAsteroidStyle === 'ornament') {
          mesh = object;
        }
      });
      if (!mesh) return null;
      const matrix = mesh.matrix.clone();
      const position = scratch();
      const quaternion = mesh.quaternion.clone();
      const scale = mesh.scale.clone();
      let best = null;
      let bestScore = -Infinity;
      for (let index = 0; index < mesh.count; index += 1) {
        mesh.getMatrixAt(index, matrix);
        matrix.decompose(position, quaternion, scale);
        const local = position.clone();
        mesh.localToWorld(local);
        const size = scale.x;
        const score = local.z + size * 4;
        if (score > bestScore) {
          bestScore = score;
          best = local.clone();
        }
      }
      if (!best) return null;
      const offset = scratch().set(0.35, 0.28, 1.15);
      frame(best, offset);
      return { x: best.x, y: best.y, z: best.z, score: bestScore };
    },
  };
  return {
    santa: Boolean(astronaut.userData.kidsGalaxySanta),
    gift: Boolean(satellite.userData.kidsGalaxyGiftSatellite),
  };
}
"""


def shoot(page, out_dir: Path, name: str, filename: str) -> None:
    # The canvas never goes idle — the wall is a live render loop — so an
    # element screenshot waits forever for a stable box. Capture the compositor
    # frame instead.
    page.evaluate(f"() => window.__christmasFrames.{name}()")
    page.wait_for_timeout(180)
    client = page.context.new_cdp_session(page)
    payload = client.send("Page.captureScreenshot", {"format": "png"})
    client.detach()
    (out_dir / filename).write_bytes(base64.b64decode(payload["data"]))


def main() -> int:
    out_dir = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_OUT
    out_dir.mkdir(parents=True, exist_ok=True)

    with Server() as server:
        planet_id = server.upload(
            "Noel",
            (186, 64, 64),
            style="spiky",
            mountain_color="#d98242",
            companions="astronaut,satellite",
        )
        server.update_behavior(
            mode="manual",
            manual_theme="christmas",
            asteroid_belt_enabled=True,
            ambient_effects=True,
        )

        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(
                executable_path=chromium_executable(),
                args=["--use-gl=swiftshader", "--enable-unsafe-swiftshader"],
            )
            page = browser.new_page(viewport={"width": 1440, "height": 900})
            page.goto(server.base, wait_until="domcontentloaded")
            page.wait_for_function(
                "() => Boolean(window.kidsGalaxy?.engine?.behaviorController?.current)",
                timeout=30_000,
            )
            page.wait_for_function(
                f"() => window.kidsGalaxy.kidPlanets.has('{planet_id}')",
                timeout=30_000,
            )
            page.wait_for_function(
                "() => window.kidsGalaxy.engine.behaviorController.current?.theme === 'christmas'",
                timeout=15_000,
            )
            page.wait_for_function(
                f"() => window.kidsGalaxy.kidPlanets.get('{planet_id}')?.companions"
                ".find((record) => record.type === 'astronaut')?.object?.userData"
                "?.kidsGalaxySanta === true",
                timeout=15_000,
            )
            page.evaluate("(id) => { window.__christmasPlanetId = id; }", planet_id)
            # Let the surface worker and one ornament belt settle before framing.
            page.wait_for_timeout(800)
            ready = page.evaluate(FRAME_SCRIPT)
            print(ready)
            shots = (
                ("santa", "christmas-santa.png"),
                ("gift", "christmas-gift-satellite.png"),
                ("ornament", "christmas-ornaments.png"),
                ("pair", "christmas-scene.png"),
            )
            for name, filename in shots:
                shoot(page, out_dir, name, filename)
                print(f"wrote {out_dir / filename}")
            browser.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
