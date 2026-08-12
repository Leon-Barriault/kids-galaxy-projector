#!/usr/bin/env python3
"""
The galaxy must still be animating after previews are published.

This is the regression guard for the freeze that survived two earlier fixes,
because both of those were aimed at the wrong mechanism. The failure was never
memory: `ProjectorSnapshotPublisher.capture()` saved the renderer's target,
`await`ed PNG encoding while still holding it, and let concurrent captures
save and restore each other's targets. Whichever way it went wrong, the
renderer ended up bound to an offscreen - sometimes disposed - target, and
every later frame drew into it. The scene graph stayed perfect, the animation
loop kept running, and nothing was logged. Only the picture stopped.

That is why this check is deliberately not a scene-state assertion. It uploads
enough planets to force captures to overlap, then looks at two things that a
state assertion cannot see:

  1. `renderer.getRenderTarget()` is null once the dust settles - the invariant
     that actually broke.
  2. Successive screenshots of the page differ - the projector is still putting
     new frames on the glass.

Screenshots rather than reading the WebGL canvas directly: the renderer runs
without preserveDrawingBuffer, so drawImage() off it outside the frame returns
blank and would pass this test on a frozen projector.
"""

from __future__ import annotations

import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

from check_projector import Server, chromium_executable, kid_style_png_bytes, wait_for

REPO_ROOT = Path(__file__).resolve().parent.parent
ARTIFACTS = REPO_ROOT / "artifacts"

# Enough planets that their texture loads land inside the same 60 ms schedule()
# window and their captures genuinely overlap. Two was not enough to reproduce
# the original freeze by hand; a full gallery always did.
PLANET_COUNT = 8
BODY_COLOURS = ("#2196F3", "#E91E63", "#4CAF50", "#FF9800")


def check(condition: bool, description: str, failures: list[str]) -> None:
    print(f"  {'PASS' if condition else 'FAIL'}  {description}")
    if not condition:
        failures.append(description)


def frame_signature(page) -> bytes:
    """A screenshot of the live canvas, as the projector's audience sees it."""
    return page.locator("canvas").first.screenshot()


def differing_bytes(first: bytes, second: bytes) -> int:
    if len(first) != len(second):
        return max(len(first), len(second))
    return sum(1 for a, b in zip(first, second) if a != b)


def main() -> int:
    failures: list[str] = []
    ARTIFACTS.mkdir(exist_ok=True)

    with Server() as server, sync_playwright() as playwright:
        planet_ids = [
            server.upload(
                f"Freeze Guard {index}",
                artwork=kid_style_png_bytes(),
                body_color=BODY_COLOURS[index % len(BODY_COLOURS)],
            )
            for index in range(PLANET_COUNT)
        ]

        browser = playwright.chromium.launch(
            executable_path=chromium_executable(),
            args=["--use-gl=swiftshader", "--enable-unsafe-swiftshader"],
        )
        page = browser.new_page(viewport={"width": 1280, "height": 720})
        errors: list[str] = []
        page.on(
            "console",
            lambda message: errors.append(message.text) if message.type == "error" else None,
        )
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto(f"{server.base}/", wait_until="load")

        published = " && ".join(
            f"Boolean(window.kidsGalaxy?.kidPlanets?.get('{planet_id}')"
            f"?.userData?.kidsGalaxyWebglSnapshotPublished)"
            for planet_id in planet_ids
        )
        wait_for(page, f"() => {published}", 40_000)
        settled = page.evaluate(f"() => {published}")
        check(settled, f"all {PLANET_COUNT} planets published a snapshot", failures)

        # The invariant. A snapshot that finished tidily leaves the renderer
        # drawing to the canvas; anything else means a capture kept the target.
        bound = page.evaluate("() => window.kidsGalaxy.renderer.getRenderTarget()")
        check(bound is None, f"renderer draws to the canvas after capture (got {bound!r})", failures)

        # And the symptom. Two frames a good interval apart must differ: the
        # star field rotates and the sun pulses every frame, so a live projector
        # cannot produce two identical screenshots here.
        first = frame_signature(page)
        time.sleep(1.2)
        second = frame_signature(page)
        moved = differing_bytes(first, second)
        check(moved > 0, "projector is still drawing new frames after publishing", failures)
        (ARTIFACTS / "freeze-guard-first.png").write_bytes(first)
        (ARTIFACTS / "freeze-guard-second.png").write_bytes(second)

        # A capture that leaves the target bound is invisible in the console,
        # which is exactly why this file exists - but a genuine exception during
        # one is worth failing on too.
        check(errors == [], f"no browser errors across concurrent captures ({errors[:3]})", failures)
        browser.close()

    if failures:
        print(f"\n{len(failures)} projector liveness check(s) failed:")
        for failure in failures:
            print(f"  - {failure}")
        return 1
    print("\nprojector stays live after snapshot publishing")
    return 0


if __name__ == "__main__":
    sys.exit(main())
