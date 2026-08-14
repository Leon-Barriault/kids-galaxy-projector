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

The publisher now serialises captures, so this regression check does not need to
stress an overlapping-capture race anymore. It loads a bounded multi-planet
batch, drains the real serial snapshot queue, and then verifies the renderer
contract directly:

  1. Every planet finishes its renderer setup before snapshot timing begins.
  2. Every queued planet publishes its WebGL snapshot.
  3. `renderer.getRenderTarget()` is null once the dust settles - the invariant
     that actually broke.
  4. The renderer canvas is still attached and the WebGL context is healthy.
  5. Three.js' render-frame counter advances while the renderer remains on the
     default framebuffer.

A browser screenshot is deliberately not part of this check. Playwright waits
for an animated canvas to become stable before an element screenshot, and the
page screenshot/compositor path is also unreliable under CI SwiftShader. The
renderer frame counter measures submitted renders without imposing either wait.
"""

from __future__ import annotations

from _projector_deps import require as _require_projector_dependencies

_require_projector_dependencies()

import sys

from playwright.sync_api import sync_playwright

from check_projector import Server, chromium_executable, kid_style_png_bytes, wait_for

# Four full 700x700 SwiftShader captures exercise ordering/restoration across a
# real serial queue while keeping this focused liveness guard within a stable CI
# budget. The separate export acceptance test covers the larger gallery/export
# workload; this test's purpose is specifically post-queue renderer health.
PLANET_COUNT = 4
BODY_COLOURS = ("#2196F3", "#E91E63", "#4CAF50", "#FF9800")


def check(condition: bool, description: str, failures: list[str]) -> None:
    print(f"  {'PASS' if condition else 'FAIL'}  {description}")
    if not condition:
        failures.append(description)


def render_state(page) -> dict:
    """Return renderer signals that distinguish a live canvas from the freeze."""
    return page.evaluate(
        """
        () => {
          const renderer = window.kidsGalaxy.renderer;
          return {
            screenTarget: renderer.getRenderTarget() === null,
            renderFrame: renderer.info.render.frame,
            canvasConnected: renderer.domElement?.isConnected === true,
            contextLost: renderer.getContext().isContextLost(),
          };
        }
        """
    )


def snapshot_progress(page, planet_ids: list[str]) -> dict:
    """Report lifecycle progress so a CI timeout says what is actually slow."""
    return page.evaluate(
        """
        (ids) => {
          const kg = window.kidsGalaxy;
          return {
            entities: ids.filter((id) => kg?.kidPlanets?.has(id)).length,
            ready: ids.filter((id) => Boolean(
              kg?.kidPlanets?.get(id)?.mesh?.geometry?.userData?.kidsGalaxyBeveledRelief
            )).length,
            published: ids.filter((id) => Boolean(
              kg?.kidPlanets?.get(id)?.userData?.kidsGalaxyWebglSnapshotPublished
            )).length,
            pendingTimers: kg?.engine?.snapshotPublisher?.pending?.size ?? null,
          };
        }
        """,
        planet_ids,
    )


def drain_snapshot_queue(page, timeout_ms: int = 120_000) -> bool:
    """Wait for schedule() deferrals and then the publisher's real serial queue."""
    return page.evaluate(
        """
        async (timeoutMs) => {
          const publisher = window.kidsGalaxy?.engine?.snapshotPublisher;
          if (!publisher) return false;
          const deadline = performance.now() + timeoutMs;

          await new Promise((resolve) => {
            requestAnimationFrame(() => {
              requestAnimationFrame(() => window.setTimeout(resolve, 100));
            });
          });

          while (publisher.pending.size > 0 && performance.now() < deadline) {
            await new Promise((resolve) => window.setTimeout(resolve, 25));
          }
          if (publisher.pending.size > 0) return false;

          const remaining = Math.max(0, deadline - performance.now());
          return Promise.race([
            publisher.captureQueue.then(() => true),
            new Promise((resolve) => window.setTimeout(() => resolve(false), remaining)),
          ]);
        }
        """,
        timeout_ms,
    )


def main() -> int:
    failures: list[str] = []

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

        ready = " && ".join(
            f"Boolean(window.kidsGalaxy?.kidPlanets?.get('{planet_id}')"
            f"?.mesh?.geometry?.userData?.kidsGalaxyBeveledRelief)"
            for planet_id in planet_ids
        )
        wait_for(page, f"() => {ready}", 90_000)
        progress = snapshot_progress(page, planet_ids)
        check(
            progress["ready"] == PLANET_COUNT,
            f"all {PLANET_COUNT} planets finished renderer setup "
            f"({progress['ready']}/{PLANET_COUNT} ready, {progress['entities']} present)",
            failures,
        )

        queue_drained = drain_snapshot_queue(page)
        progress = snapshot_progress(page, planet_ids)
        check(
            queue_drained,
            f"snapshot queue drains ({progress['published']}/{PLANET_COUNT} published, "
            f"{progress['pendingTimers']} timers pending)",
            failures,
        )
        check(
            progress["published"] == PLANET_COUNT,
            f"all {PLANET_COUNT} planets published a snapshot "
            f"({progress['published']}/{PLANET_COUNT})",
            failures,
        )

        first = render_state(page)
        check(first["screenTarget"], "renderer draws to the canvas after capture", failures)
        check(first["canvasConnected"], "renderer canvas remains attached after queued captures", failures)
        check(not first["contextLost"], "WebGL context remains healthy after queued captures", failures)

        wait_for(
            page,
            f"() => window.kidsGalaxy.renderer.info.render.frame > {first['renderFrame']}",
            15_000,
        )
        second = render_state(page)
        check(
            second["renderFrame"] > first["renderFrame"],
            "projector keeps submitting frames after publishing",
            failures,
        )
        check(second["screenTarget"], "later frames still target the visible framebuffer", failures)
        check(second["canvasConnected"], "renderer canvas stays attached while frames advance", failures)
        check(not second["contextLost"], "WebGL context stays healthy while frames advance", failures)

        check(errors == [], f"no browser errors across queued captures ({errors[:3]})", failures)
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
