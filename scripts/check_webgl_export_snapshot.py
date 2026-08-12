#!/usr/bin/env python3
"""Acceptance test for projector-authored print/PDF hero snapshots."""

from __future__ import annotations

import io
import sys
import time
from pathlib import Path

import httpx
from PIL import Image
from playwright.sync_api import sync_playwright

from check_projector import Server, kid_style_png_bytes, wait_for

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

        # The server must never silently generate a mismatched print before the
        # projector has published its real Three.js render.
        before = httpx.get(
            f"{server.base}/api/admin/planets/{planet_id}/print.pdf",
            timeout=5,
        )
        check(before.status_code == 409, "print waits for the projector WebGL render", failures)

        browser = playwright.chromium.launch(
            args=["--use-gl=swiftshader", "--enable-unsafe-swiftshader"]
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
            f"Boolean(window.kidsGalaxy?.kidPlanets?.get('{planet_id}')?.mesh?.material?.userData?.kidsGalaxyTrueSculptedArtwork)",
            12_000,
        )
        wait_for(
            page,
            f"Boolean(window.kidsGalaxy?.kidPlanets?.get('{planet_id}')?.userData?.kidsGalaxyWebglSnapshotPublished)",
            12_000,
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
