#!/usr/bin/env python3
"""Capture what the projector actually renders, as PNGs a human can look at.

Appearance work needs a picture, not an assertion. This boots the real server,
drives the real projector page in headless Chromium, waits for the projector's
own snapshot publisher to push each finished hero frame, and writes those
frames out. What lands in the output directory is exactly what a printed sheet
would show, so a look change can be judged before and after instead of guessed
at.

    python3.12 scripts/capture_planet_look.py /tmp/look/before
"""

from __future__ import annotations

# Checked before the third-party imports below, so a missing Playwright or
# Pillow reports one install command instead of a bare ModuleNotFoundError.
from _projector_deps import require as _require_projector_dependencies

_require_projector_dependencies()

import io
import json
import sys
import time
from pathlib import Path

import httpx
from PIL import Image, ImageDraw
from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).resolve().parent))
from check_projector import Server, wait_for  # noqa: E402

CANVAS = 512


def _chromium_path() -> str | None:
    """
    Use whatever full Chromium build this machine has.

    Playwright pins an exact browser revision and refuses to launch anything
    else by default, which makes this script fail on any host whose pinned
    build differs from the installed one. It also prefers the headless shell,
    which has no GPU stack at all - useless for a WebGL capture.
    """
    candidates = sorted(Path("/opt/pw-browsers").glob("chromium-*/chrome-linux/chrome"))
    return str(candidates[-1]) if candidates else None


def _arc(centre_x, centre_y, radius, steps=18):
    """Points along the upper half of a circle, as a child sweeps a finger."""
    import math

    return [
        (
            centre_x + radius * math.cos(math.pi + math.pi * step / steps),
            centre_y + radius * math.sin(math.pi + math.pi * step / steps),
        )
        for step in range(steps + 1)
    ]


def _disc(background: str, strokes) -> bytes:
    """
    A drawing shaped exactly the way the tablet sends them.

    AndroidPlanetTextureRenderer fills the whole square with the chosen body
    colour and then clips the child's strokes to the inscribed circle. Testing
    with a disc on white instead invents a white background the projector never
    receives, and any conclusion drawn from that picture is about the test, not
    about the product.
    """
    image = Image.new("RGB", (CANVAS, CANVAS), background)
    painted = Image.new("RGB", (CANVAS, CANVAS), background)
    draw = ImageDraw.Draw(painted)
    for points, colour, width in strokes:
        draw.line(points, fill=colour, width=width, joint="curve")

    mask = Image.new("L", (CANVAS, CANVAS), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, CANVAS - 1, CANVAS - 1), fill=255)
    image.paste(painted, (0, 0), mask)

    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def _manifest(background: str, strokes) -> bytes:
    """The same strokes as the sidecar the projector actually renders from.

    Derived from the identical data as the raster above, because they were
    previously unrelated: this script drew four distinct pictures and then let
    the shared harness attach its default three-stroke manifest, which wins.
    Every planet came out as the same purple/orange/green bands and only the
    body colour differed, so the drawings here were decorative and any visual
    judgement made from these captures was made against one shape.
    """
    return json.dumps(
        {
            "version": 1,
            "coordinate_space": "normalized-canvas-v1",
            "canvas": {"width": CANVAS, "height": CANVAS},
            "background_color": background.lower(),
            "background_explicit": True,
            "strokes": [
                {
                    "stroke_id": f"stroke-{index}",
                    "order": index,
                    "color": colour.lower(),
                    "width_px": width,
                    "width_normalized": width / CANVAS,
                    "points": [
                        [
                            max(0.0, min(1.0, x / CANVAS)),
                            max(0.0, min(1.0, y / CANVAS)),
                        ]
                        for x, y in points
                    ],
                }
                for index, (points, colour, width) in enumerate(strokes)
            ],
        }
    ).encode()


# Strokes only - no filled ellipses. The manifest format is polylines, which is
# also what a finger produces, so a fixture built from ellipses cannot be
# expressed as a sidecar and could never have matched what gets rendered.
_SWIRL = [
    ([(190, 110), (150, 195), (205, 285), (160, 385)], "#f4e04d", 24),
    ([(252, 100), (284, 200), (240, 300), (276, 396)], "#f4e04d", 24),
    ([(322, 120), (298, 212), (348, 300), (312, 386)], "#f4e04d", 24),
    ([(140, 156), (118, 244), (162, 330)], "#f4e04d", 22),
    ([(374, 164), (392, 252), (356, 342)], "#f4e04d", 22),
]

# Both regimes at once, plus a stroke that used to fall between them. The two
# classifications now meet exactly, so the 55-degree mark is a band rather than
# a stamp - watch that it wraps rather than sitting on one face.
_MIXED = [
    ([(96, 150), (200, 128), (300, 156), (410, 134)], "#4fc3f7", 40),
    ([(100, 372), (210, 396), (320, 366), (412, 390)], "#4fc3f7", 40),
    ([(196, 116), (168, 210), (214, 300), (176, 392)], "#ffd166", 24),
    ([(330, 120), (356, 214), (312, 302), (344, 394)], "#ffd166", 24),
    # spanX/spanY about 0.70 - the old dead band.
    ([(150, 180), (260, 336)], "#ff5f8f", 26),
]

_OCEAN = [
    ([(110, 150), (190, 175), (250, 150)], "#5ec46b", 60),
    ([(258, 300), (330, 330), (398, 300)], "#5ec46b", 56),
    ([(178, 350), (240, 372)], "#e8b23a", 40),
]

_LAVA = [
    ([(120, 200), (220, 175), (300, 215)], "#ff8a3d", 62),
    ([(288, 330), (360, 356), (400, 330)], "#e04b3a", 50),
    ([(120, 380), (250, 255), (380, 130)], "#ffd166", 26),
]

_TWO_TONE = [
    ([(132, 170), (255, 140), (378, 172)], "#b06ee0", 70),
    ([(124, 340), (230, 372), (330, 340)], "#ffd166", 66),
]

_RAINBOW = [
    (_arc(CANVAS // 2, 390, 220), "#7b3fb5", 44),
    (_arc(CANVAS // 2, 390, 170), "#e8862f", 44),
    (_arc(CANVAS // 2, 390, 120), "#f0d040", 44),
    (_arc(CANVAS // 2, 390, 70), "#4fae54", 44),
]

SUBJECTS = (
    # First, because it is the one that shows how a tall mark wraps: several
    # near-vertical squiggles, which used to stamp as a cluster on one face.
    ("swirl", "#d81b60", _SWIRL),
    ("mixed", "#37474f", _MIXED),
    ("rainbow", "#f2f2f2", _RAINBOW),
    ("ocean", "#3aa0e8", _OCEAN),
    ("lava", "#7a2f2f", _LAVA),
    ("twotone", "#2f4f8f", _TWO_TONE),
)


def main(out_dir: Path) -> int:
    out_dir.mkdir(parents=True, exist_ok=True)
    with Server() as server:
        planets = {
            label: server.upload(
                label.title(),
                artwork=_disc(background, strokes),
                manifest=_manifest(background, strokes),
                body_color=background,
            )
            for label, background, strokes in SUBJECTS
        }

        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(
                executable_path=_chromium_path(),
                args=[
                    "--use-gl=swiftshader",
                    "--enable-unsafe-swiftshader",
                    "--disable-dev-shm-usage",
                ],
            )
            page = browser.new_page(viewport={"width": 1280, "height": 800})
            errors: list[str] = []
            page.on("pageerror", lambda error: errors.append(str(error)))
            page.on(
                "console",
                lambda message: (
                    errors.append(message.text) if message.type == "error" else None
                ),
            )
            # "load", not "networkidle". PlanetLoader opens an EventSource on
            # /api/events and holds it for the life of the page, and networkidle
            # waits for zero network connections for 500ms - so it could never
            # fire and this always spent the full 30 second timeout before
            # failing. Deterministic, not flaky, and invisible because this
            # script is not in projector-ci.yml. Every other script in here
            # already used "load".
            page.goto(f"{server.base}/", wait_until="load")

            # Wait for the render to actually exist rather than sleeping at it.
            # A planet is done when a surface stage has claimed its body; the
            # geometry rebuild that stage now performs is real work, so a fixed
            # sleep is a guess that gets worse as the renderer gets slower.
            wait_for(
                page,
                "(() => {"
                f"  const kg = window.kidsGalaxy;"
                f"  if (!kg?.kidPlanets || kg.kidPlanets.size < {len(planets)}) return false;"
                "  return [...kg.kidPlanets.values()].every((p) => {"
                "    const d = p?.mesh?.material?.userData || {};"
                "    return Boolean(d.kidsGalaxySoftToySurface || d.kidsGalaxyManifestStrokeSurface);"
                "  });"
                "})()",
                30_000,
            )
            # Settle: entry animations, ring rotation and the first few frames of
            # the environment prefilter all land after the surface is applied.
            page.wait_for_timeout(4000)
            # Best effort, and deliberately not fatal. This is the whole-page
            # compositor path, which is unreliable under CI SwiftShader - the
            # same reason the export checks stopped screenshotting. It also ran
            # before the hero frames, so one flaky screenshot threw away the
            # entire capture. The hero frames come from readRenderTargetPixels
            # and do not touch the compositor at all, so they are worth having
            # even when this fails.
            try:
                page.screenshot(path=str(out_dir / "scene.png"), timeout=15_000)
            except Exception as error:  # noqa: BLE001 - the frames matter, this does not
                print(f"  ! scene.png skipped: {type(error).__name__}")

            failures = page.evaluate(
                "({"
                "  softToy: window.kidsGalaxySoftToyFailures || [],"
                "  manifest: window.kidsGalaxyManifestStrokeFailures || [],"
                "})"
            )
            # Both surface stages swallow their exceptions into these arrays and
            # fall back to the older appearance, so a broken renderer looks like
            # a working one in a screenshot. Say so out loud.
            for kind, entries in failures.items():
                for entry in entries:
                    errors.append(f"{kind} surface failed on {entry.get('id')}: {entry.get('message')}")

            # The hero frames below are fetched from the server *after* the
            # browser is gone, but it is the browser that produces them:
            # ProjectorSnapshotPublisher renders each planet into a render
            # target and POSTs it, debounced and retried with backoff. So every
            # snapshot has to be published before this page closes.
            #
            # Nothing here used to wait for that. It happened to work only
            # because the networkidle bug held the page open for its full 30
            # second timeout first - the page was alive and rendering that whole
            # time. Fixing the timeout removed the accident and took the capture
            # window with it, which is why the later planets in the gallery
            # stopped producing frames. This waits on the publisher's own signal
            # instead of on a side effect of a bug.
            wait_for(
                page,
                "(() => {"
                "  const kg = window.kidsGalaxy;"
                f"  if (!kg?.kidPlanets || kg.kidPlanets.size < {len(planets)}) return false;"
                "  return [...kg.kidPlanets.values()].every("
                "    (p) => p?.userData?.kidsGalaxyWebglSnapshotPublished"
                "  );"
                "})()",
                90_000,
            )
            unpublished = page.evaluate(
                "[...window.kidsGalaxy.kidPlanets.values()]"
                "  .filter((p) => !p?.userData?.kidsGalaxyWebglSnapshotPublished)"
                "  .map((p) => p.id)"
            )
            for planet_id in unpublished:
                errors.append(f"snapshot never published for {planet_id}")

            browser.close()

        published = 0
        for label, planet_id in planets.items():
            deadline = time.time() + 20
            while time.time() < deadline:
                response = httpx.get(
                    f"{server.base}/api/admin/planets/{planet_id}/preview.png",
                    timeout=10,
                )
                source = response.headers.get("x-kids-galaxy-render-source")
                if response.status_code == 200 and source == "webgl":
                    (out_dir / f"{label}.png").write_bytes(response.content)
                    published += 1
                    break
                time.sleep(0.5)
            else:
                print(f"  ! {label}: projector never published a WebGL frame")

        print(f"captured {published}/{len(planets)} hero frames into {out_dir}")
        for error in errors[:10]:
            print(f"  console error: {error}")
        return 0 if published == len(planets) else 1


if __name__ == "__main__":
    # Default inside the repo rather than at "/tmp/look". A POSIX absolute path
    # is drive-relative on Windows, so running this without an argument there
    # silently wrote the frames to C:\tmp\look - reachable, but not where anyone
    # looks, and not where the message said they went. artifacts/look is
    # gitignored precisely because these are rewritten on every run.
    default = Path(__file__).resolve().parent.parent / "artifacts" / "look"
    target = Path(sys.argv[1]) if len(sys.argv) > 1 else default
    raise SystemExit(main(target))
