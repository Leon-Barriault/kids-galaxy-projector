#!/usr/bin/env python3
"""Browser acceptance for tablet-selected Saturn ring colour fidelity."""

from __future__ import annotations

from playwright.sync_api import sync_playwright

from check_projector import FAILURES, Server, check, wait_for
from check_visual_renderer import kid_disc_image, png_bytes


def main() -> int:
    drawing = png_bytes(kid_disc_image())

    with Server() as server, sync_playwright() as pw:
        warm = server.upload(
            "Warm Ring",
            artwork=drawing,
            style="ringed",
            ring_color="#ff5a55",
        )
        cool = server.upload(
            "Cool Ring",
            artwork=drawing,
            style="ringed",
            ring_color="#4b83ff",
        )

        browser = pw.chromium.launch(
            args=["--use-gl=swiftshader", "--enable-unsafe-swiftshader"]
        )
        page = browser.new_page(viewport={"width": 900, "height": 700})
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
            f"Boolean(window.kidsGalaxy.kidPlanets.get('{warm}')?.decorations?.find((d) => d.userData?.kidsGalaxyRingColorFidelity))",
            12_000,
        )
        wait_for(
            page,
            f"Boolean(window.kidsGalaxy.kidPlanets.get('{cool}')?.decorations?.find((d) => d.userData?.kidsGalaxyRingColorFidelity))",
            12_000,
        )

        result = page.evaluate(
            """
            ([warmId, coolId]) => {
              const read = (id) => {
                const planet = window.kidsGalaxy.kidPlanets.get(id);
                const ring = planet.decorations.find(
                  (item) => item.userData?.kidsGalaxySaturnParticleRing,
                );
                let r = 0;
                let g = 0;
                let b = 0;
                let samples = 0;

                const sampleAttribute = (attribute) => {
                  if (!attribute?.count) return;
                  const stride = Math.max(1, Math.floor(attribute.count / 1800));
                  for (let index = 0; index < attribute.count; index += stride) {
                    r += attribute.getX(index);
                    g += attribute.getY(index);
                    b += attribute.getZ(index);
                    samples += 1;
                  }
                };

                ring.children.forEach((layer) => {
                  if (layer.instanceColor) sampleAttribute(layer.instanceColor);
                  const colors = layer.geometry?.getAttribute?.('color');
                  if (colors) sampleAttribute(colors);
                });

                return {
                  selected: ring.userData.kidsGalaxySelectedRingColor,
                  fidelity: Boolean(ring.userData.kidsGalaxyRingColorFidelity),
                  treatment: ring.userData.kidsGalaxyRingColorTreatment,
                  recolored: ring.userData.kidsGalaxyRecoloredParticleCount || 0,
                  particleCount: ring.userData.kidsGalaxyRingParticleCount || 0,
                  solid: ring.userData.kidsGalaxyRingIsSolid,
                  solidGeometry: ring.children.some(
                    (layer) =>
                      layer.geometry?.type === 'RingGeometry' ||
                      layer.geometry?.type === 'ExtrudeGeometry',
                  ),
                  average: samples
                    ? { r: r / samples, g: g / samples, b: b / samples }
                    : { r: 0, g: 0, b: 0 },
                };
              };
              return { warm: read(warmId), cool: read(coolId) };
            }
            """,
            [warm, cool],
        )

        warm_ring = result["warm"]
        cool_ring = result["cool"]
        warm_avg = warm_ring["average"]
        cool_avg = cool_ring["average"]

        print("\nselected ring colour fidelity")
        check(warm_ring["fidelity"] and cool_ring["fidelity"], "ring colour fidelity layer is active")
        check(warm_ring["selected"] == "#ff5a55", "warm tablet ring selection reaches the projector unchanged")
        check(cool_ring["selected"] == "#4b83ff", "cool tablet ring selection reaches the projector unchanged")
        check(
            warm_ring["treatment"] == "selected-hue-radial-variants"
            and cool_ring["treatment"] == "selected-hue-radial-variants",
            "ice/dust/rock vary around the selected hue instead of neutral grey/white",
        )
        check(
            warm_avg["r"] > warm_avg["b"] * 1.35
            and warm_avg["r"] > warm_avg["g"] * 1.18,
            "red tablet selection produces an unmistakably red-dominant Saturn ring",
        )
        check(
            cool_avg["b"] > cool_avg["r"] * 1.35
            and cool_avg["b"] > cool_avg["g"] * 1.12,
            "blue tablet selection produces an unmistakably blue-dominant Saturn ring",
        )
        colour_distance = (
            (warm_avg["r"] - cool_avg["r"]) ** 2
            + (warm_avg["g"] - cool_avg["g"]) ** 2
            + (warm_avg["b"] - cool_avg["b"]) ** 2
        ) ** 0.5
        check(colour_distance > 0.22, "different tablet selections remain visibly distinct in particle colours")

        print("\ncomposition remains untouched")
        check(
            warm_ring["particleCount"] == cool_ring["particleCount"],
            "ring particle composition is independent of selected colour",
        )
        check(
            warm_ring["recolored"] >= warm_ring["particleCount"]
            and cool_ring["recolored"] >= cool_ring["particleCount"],
            "all rendered ring particles receive the selected-hue treatment",
        )
        check(
            warm_ring["solid"] is False
            and cool_ring["solid"] is False
            and not warm_ring["solidGeometry"]
            and not cool_ring["solidGeometry"],
            "colour fidelity does not reintroduce a solid record/annulus",
        )
        check(errors == [], f"no browser console errors ({errors[:3]})")

        browser.close()

    if FAILURES:
        print(f"\n{len(FAILURES)} ring-colour check(s) failed:")
        for failure in FAILURES:
            print(f"  - {failure}")
        return 1
    print("\nring colour fidelity acceptance passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
