#!/usr/bin/env python3
"""Acceptance checks for centred, unclipped projector export snapshots."""

from __future__ import annotations

from _projector_deps import require as _require_projector_dependencies

_require_projector_dependencies()

import io
import sys
import time

import httpx
from PIL import Image
from playwright.sync_api import sync_playwright

from check_projector import Server, chromium_executable, wait_for

SNAPSHOT_SIZE = 700
MIN_VISIBLE_MARGIN = 24
MAX_CENTRE_OFFSET = 36


def check(condition: bool, description: str, failures: list[str]) -> None:
    print(f"  {'PASS' if condition else 'FAIL'}  {description}")
    if not condition:
        failures.append(description)


def wait_for_webgl_preview(base: str, planet_id: str, timeout: float = 20.0):
    url = f"{base}/api/admin/planets/{planet_id}/preview.png"
    deadline = time.time() + timeout
    last = None
    while time.time() < deadline:
        last = httpx.get(url, timeout=5)
        if (
            last.status_code == 200
            and last.headers.get("x-kids-galaxy-render-source") == "webgl"
        ):
            return last
        time.sleep(0.2)
    return last


def visible_bounds(image: Image.Image) -> tuple[int, int, int, int] | None:
    """Return bounds of visible WebGL pixels, ignoring faint transparent AA noise."""
    alpha = image.convert("RGBA").getchannel("A")
    mask = alpha.point(lambda value: 255 if value >= 16 else 0)
    return mask.getbbox()


def main() -> int:
    failures: list[str] = []

    with Server() as server, sync_playwright() as playwright:
        planet_id = server.upload(
            "Snapshot Framing",
            body_color="#EC1760",
            style="classic",
        )

        browser = playwright.chromium.launch(
            executable_path=chromium_executable(),
            args=["--use-gl=swiftshader", "--enable-unsafe-swiftshader"],
        )
        page = browser.new_page(viewport={"width": 2560, "height": 1440})
        page.goto(f"{server.base}/", wait_until="load")
        wait_for(
            page,
            f"Boolean(window.kidsGalaxy?.kidPlanets?.get('{planet_id}')?.mesh?.geometry)",
            12_000,
        )
        wait_for(
            page,
            f"Boolean(window.kidsGalaxy?.kidPlanets?.get('{planet_id}')?.userData?.kidsGalaxyWebglSnapshotPublished)",
            20_000,
        )

        # Regression for the failure mode behind clipped print/PDF heroes.
        # Three.js geometries cache bounding boxes. Relief/polar stages mutate the
        # position attribute, so an old cached box can describe a smaller sphere
        # than the vertices the renderer will actually draw. Deliberately replace
        # the live mesh's cached box with a zero-size one. createExportScene()
        # must still recover the real extent from transformed vertices.
        framing = page.evaluate(
            """
            (id) => {
              const kg = window.kidsGalaxy;
              const entity = kg.kidPlanets.get(id);
              const publisher = kg.engine.snapshotPublisher;
              const geometry = entity.mesh.geometry;
              if (!geometry.boundingBox) geometry.computeBoundingBox();

              const box = geometry.boundingBox;
              const originalMin = box.min.clone();
              const originalMax = box.max.clone();
              const sourceSpan = originalMax.clone().sub(originalMin).length();
              let exportScene = null;
              try {
                box.min.set(0, 0, 0);
                box.max.set(0, 0, 0);
                exportScene = publisher.createExportScene(entity);
                const bounds = exportScene.userData.kidsGalaxyExportFramingBounds;
                const framedSpan = bounds.max.clone().sub(bounds.min).length();
                const camera = publisher.createExportCamera(entity, exportScene);
                return {
                  sourceSpan,
                  framedSpan,
                  cameraDistance: camera.position.distanceTo(bounds.getCenter(box.min.clone())),
                };
              } finally {
                box.min.copy(originalMin);
                box.max.copy(originalMax);
                if (exportScene) publisher.disposeExportScene(exportScene);
              }
            }
            """,
            planet_id,
        )
        check(
            framing["sourceSpan"] > 0
            and framing["framedSpan"] >= framing["sourceSpan"] * 0.95,
            "export framing uses vertex geometry rather than a stale cached bounding box "
            f"({framing['framedSpan']:.2f} vs source {framing['sourceSpan']:.2f})",
            failures,
        )
        check(
            framing["cameraDistance"] > 0,
            "export camera is fitted from the recovered geometry bounds",
            failures,
        )

        response = wait_for_webgl_preview(server.base, planet_id)
        check(
            response is not None and response.status_code == 200,
            "projector publishes a WebGL snapshot for framing inspection",
            failures,
        )

        if response is not None and response.status_code == 200:
            snapshot = Image.open(io.BytesIO(response.content)).convert("RGBA")
            check(
                snapshot.size == (SNAPSHOT_SIZE, SNAPSHOT_SIZE),
                "snapshot retains the 700x700 export contract",
                failures,
            )
            bounds = visible_bounds(snapshot)
            check(bounds is not None, "snapshot contains visible planet pixels", failures)
            if bounds is not None:
                left, top, right, bottom = bounds
                margins = (
                    left,
                    top,
                    SNAPSHOT_SIZE - right,
                    SNAPSHOT_SIZE - bottom,
                )
                centre_x = (left + right) / 2
                centre_y = (top + bottom) / 2
                expected_centre = SNAPSHOT_SIZE / 2
                check(
                    min(margins) >= MIN_VISIBLE_MARGIN,
                    "planet stays clear of every snapshot edge "
                    f"(L/T/R/B margins: {margins})",
                    failures,
                )
                check(
                    abs(centre_x - expected_centre) <= MAX_CENTRE_OFFSET
                    and abs(centre_y - expected_centre) <= MAX_CENTRE_OFFSET,
                    "visible planet remains centred in the snapshot "
                    f"(centre: {centre_x:.1f}, {centre_y:.1f})",
                    failures,
                )

        browser.close()

    if failures:
        print(f"\n{len(failures)} snapshot framing check(s) failed:")
        for failure in failures:
            print(f"  - {failure}")
        return 1

    print("\nprojector snapshot framing acceptance passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
