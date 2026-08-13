#!/usr/bin/env python3
"""Acceptance test for projector-authored print/PDF hero snapshots."""

from __future__ import annotations

# Checked before the third-party imports below, so a missing Playwright or
# Pillow reports one install command instead of a bare ModuleNotFoundError.
from _projector_deps import require as _require_projector_dependencies

_require_projector_dependencies()

import io
import json
import math
import sys
import time
from pathlib import Path

import httpx
from PIL import Image
from playwright.sync_api import sync_playwright

from check_projector import Server, chromium_executable, kid_style_png_bytes, wait_for

REPO_ROOT = Path(__file__).resolve().parent.parent
ARTIFACTS = REPO_ROOT / "artifacts"


def check(condition: bool, description: str, failures: list[str]) -> None:
    print(f"  {'PASS' if condition else 'FAIL'}  {description}")
    if not condition:
        failures.append(description)


def wait_for_webgl_preview(base: str, planet_id: str, timeout: float = 15.0):
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


def visible_ring_extent(image: Image.Image) -> tuple[int, int, int]:
    """Find non-background pixels outside the central sphere footprint."""
    rgb = image.convert("RGB")
    width, height = rgb.size
    centre_x = width // 2
    centre_y = height // 2
    background = rgb.getpixel((5, 5))
    coordinates: list[tuple[int, int]] = []

    # At this camera/FOV the 1.05-radius sphere occupies roughly 140 px, while
    # the real Saturn particle ring reaches ~285 px. Pixels beyond 175 px can
    # therefore only be ring/decorative geometry in this companion-free test.
    minimum_radius_sq = 175 * 175
    for y in range(height):
        dy = y - centre_y
        for x in range(width):
            dx = x - centre_x
            if dx * dx + dy * dy <= minimum_radius_sq:
                continue
            colour = rgb.getpixel((x, y))
            distance = sum(abs(colour[index] - background[index]) for index in range(3))
            if distance >= 55:
                coordinates.append((x, y))

    if not coordinates:
        return 0, 0, 0
    xs = [point[0] for point in coordinates]
    ys = [point[1] for point in coordinates]
    return len(coordinates), max(xs) - min(xs), max(ys) - min(ys)


def motion_state(page, planet_id: str) -> dict:
    return page.evaluate(
        """
        (id) => {
          const kg = window.kidsGalaxy;
          const planet = kg.kidPlanets.get(id);
          return {
            rotationY: planet.mesh.rotation.y,
            position: planet.mesh.position.toArray(),
            screenTarget: kg.renderer.getRenderTarget() === null,
            contextLost: kg.renderer.getContext().isContextLost(),
            renderFrame: kg.renderer.info.render.frame,
            canvasConnected: kg.renderer.domElement?.isConnected === true,
          };
        }
        """,
        planet_id,
    )


def position_distance(left: list[float], right: list[float]) -> float:
    return math.sqrt(sum((a - b) ** 2 for a, b in zip(left, right, strict=True)))


def main() -> int:
    failures: list[str] = []
    ARTIFACTS.mkdir(exist_ok=True)

    with Server() as server, sync_playwright() as playwright:
        planet_id = server.upload(
            "WebGL Export Saturn",
            artwork=kid_style_png_bytes(),
            style="ringed",
            body_color="#2196F3",
            ring_color="#ffffff",
        )
        # Fill the complete projector gallery before Chromium opens so all
        # textures finish together and snapshot publication is maximally
        # concurrent. This is the case that used to let captures save/restore
        # each other's off-screen targets out of order.
        extra_planets = [
            server.upload(
                f"Snapshot Race {index}",
                artwork=kid_style_png_bytes(),
                style="classic",
                body_color="#ffffff" if index % 2 == 0 else "#2196F3",
            )
            for index in range(11)
        ]
        snapshot_ids = [planet_id, *extra_planets]

        # Before the projector publishes, print still has to produce something.
        # This used to be a 409, and the manager polled it for ten seconds
        # before showing "HTTP 409" - which is what a parent saw whenever the
        # projector page was not open, or the planet sat past the twelfth the
        # projector holds while the manager lists thirty.
        before = httpx.get(
            f"{server.base}/api/admin/planets/{planet_id}/print.pdf",
            timeout=10,
        )
        check(before.status_code == 200, "print never dead-ends on a missing render", failures)
        check(
            before.headers.get("x-kids-galaxy-render-source") == "fallback",
            "the pre-projector sheet declares itself as the server render",
            failures,
        )

        browser = playwright.chromium.launch(
            executable_path=chromium_executable(),
            args=["--use-gl=swiftshader", "--enable-unsafe-swiftshader"],
        )
        page = browser.new_page(viewport={"width": 2560, "height": 1440})
        errors: list[str] = []
        page.on(
            "console",
            lambda message: errors.append(message.text) if message.type == "error" else None,
        )
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto(f"{server.base}/", wait_until="load")
        wait_for(
            page,
            "window.kidsGalaxy && window.kidsGalaxy.kidPlanets.size === 12",
            15_000,
        )
        wait_for(
            page,
            f"Boolean(window.kidsGalaxy?.kidPlanets?.get('{planet_id}')?.mesh?.material?.userData?.kidsGalaxyTrueSculptedArtwork)",
            12_000,
        )
        snapshot_ids_js = json.dumps(snapshot_ids)
        wait_for(
            page,
            f"{snapshot_ids_js}.every((id) => Boolean(window.kidsGalaxy?.kidPlanets?.get(id)?.userData?.kidsGalaxyWebglSnapshotPublished))",
            45_000,
        )

        # Snapshot completion must leave the renderer attached to the visible
        # default framebuffer. Numerical motion alone is not enough: the bug we
        # are guarding kept requestAnimationFrame/update running while every
        # frame was rendered to an off-screen target. Instead of asking
        # Playwright to screenshot a continuously animated SwiftShader page,
        # combine the target, canvas attachment, Three.js frame id, and planet
        # motion. Together they prove the live render loop is still submitting
        # frames to the screen after the snapshot queue has drained.
        motion_before = motion_state(page, planet_id)
        wait_for(
            page,
            f"window.kidsGalaxy.renderer.info.render.frame > {motion_before['renderFrame']}",
            15_000,
        )
        motion_after = motion_state(page, planet_id)

        check(motion_before["screenTarget"], "renderer returns to the visible framebuffer after all snapshots", failures)
        check(motion_after["screenTarget"], "renderer stays on the visible framebuffer while animating", failures)
        check(
            motion_before["canvasConnected"] and motion_after["canvasConnected"],
            "renderer canvas remains attached after rendered previews complete",
            failures,
        )
        check(not motion_before["contextLost"] and not motion_after["contextLost"], "WebGL context remains healthy after all snapshots", failures)
        check(
            motion_after["renderFrame"] > motion_before["renderFrame"],
            "renderer keeps submitting frames after rendered previews complete",
            failures,
        )
        check(
            abs(motion_after["rotationY"] - motion_before["rotationY"]) > 0.001,
            "planet rotation continues after rendered previews complete",
            failures,
        )
        check(
            position_distance(motion_before["position"], motion_after["position"]) > 0.001,
            "planet orbit continues after rendered previews complete",
            failures,
        )

        response = wait_for_webgl_preview(server.base, planet_id)
        check(response is not None and response.status_code == 200, "WebGL preview is stored on the Pi", failures)
        check(
            response is not None
            and response.headers.get("x-kids-galaxy-render-source") == "webgl",
            "preview API identifies the real projector as its visual source",
            failures,
        )

        if response is not None and response.status_code == 200:
            snapshot = Image.open(io.BytesIO(response.content)).convert("RGBA")
            check(snapshot.size == (700, 700), "projector publishes the 700x700 hero frame", failures)
            count, horizontal_span, vertical_span = visible_ring_extent(snapshot)
            check(count >= 500, f"real Saturn ring is visible outside the sphere ({count} pixels)", failures)
            check(horizontal_span >= 380, f"ring spans the hero frame horizontally ({horizontal_span}px)", failures)
            check(vertical_span >= 120, f"ring is visibly open rather than edge-on ({vertical_span}px)", failures)
            snapshot.save(ARTIFACTS / "webgl-export-ringed.png")

        print_response = httpx.get(
            f"{server.base}/api/admin/planets/{planet_id}/print.png",
            timeout=10,
        )
        check(print_response.status_code == 200, "print PNG becomes available after WebGL capture", failures)
        check(
            print_response.headers.get("x-kids-galaxy-render-source") == "webgl",
            "print PNG is sourced from projector WebGL",
            failures,
        )
        if print_response.status_code == 200:
            Image.open(io.BytesIO(print_response.content)).save(
                ARTIFACTS / "webgl-export-ringed-print.png"
            )

        pdf = httpx.get(
            f"{server.base}/api/admin/planets/{planet_id}/print.pdf",
            timeout=10,
        )
        check(pdf.status_code == 200 and pdf.content.startswith(b"%PDF"), "PDF is generated from the WebGL-backed print sheet", failures)
        check(
            pdf.headers.get("x-kids-galaxy-render-source") == "webgl",
            "PDF reports projector WebGL as its render source",
            failures,
        )
        check(errors == [], f"no browser errors while capturing export ({errors[:3]})", failures)
        browser.close()

    if failures:
        print(f"\n{len(failures)} WebGL export check(s) failed:")
        for failure in failures:
            print(f"  - {failure}")
        return 1
    print("\nprojector WebGL export snapshot acceptance passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
