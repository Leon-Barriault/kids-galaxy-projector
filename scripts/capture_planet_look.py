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


def _disc(background: str, paint) -> bytes:
    """
    A drawing shaped exactly the way the tablet sends them.

    AndroidPlanetTextureRenderer fills the whole square with the chosen body
    colour and then clips the child's strokes to the inscribed circle. Testing
    with a disc on white instead invents a white background the projector never
    receives, and any conclusion drawn from that picture is about the test, not
    about the product.
    """
    image = Image.new("RGB", (CANVAS, CANVAS), background)
    strokes = Image.new("RGB", (CANVAS, CANVAS), background)
    paint(ImageDraw.Draw(strokes))

    mask = Image.new("L", (CANVAS, CANVAS), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, CANVAS - 1, CANVAS - 1), fill=255)
    image.paste(strokes, (0, 0), mask)

    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def _ocean(draw: ImageDraw.ImageDraw) -> None:
    draw.ellipse((96, 120, 250, 235), fill="#5ec46b")
    draw.ellipse((250, 270, 400, 380), fill="#5ec46b")
    draw.ellipse((170, 330, 250, 400), fill="#e8b23a")


def _lava(draw: ImageDraw.ImageDraw) -> None:
    draw.ellipse((110, 150, 300, 290), fill="#ff8a3d")
    draw.ellipse((280, 300, 400, 400), fill="#e04b3a")
    draw.line((120, 380, 380, 130), fill="#ffd166", width=26)


def _two_tone(draw: ImageDraw.ImageDraw) -> None:
    draw.ellipse((130, 100, 380, 250), fill="#b06ee0")
    draw.ellipse((120, 280, 330, 420), fill="#ffd166")


def _rainbow_arcs(draw: ImageDraw.ImageDraw) -> None:
    """
    The shape a child actually draws: concentric rainbow semicircles.

    These must be true semicircles - equal horizontal and vertical radii. An
    earlier version used tall narrow ellipses, which made the innermost colour
    the nearest paint to the centre over a huge vertical range and let green
    swallow a third of the planet. That was the test drawing misleading the
    test, not the mapping misbehaving.
    """
    centre_x, centre_y = CANVAS // 2, 390
    for colour, radius in (("#7b3fb5", 220), ("#e8862f", 170), ("#f0d040", 120), ("#4fae54", 70)):
        draw.arc(
            (centre_x - radius, centre_y - radius, centre_x + radius, centre_y + radius),
            start=180,
            end=360,
            fill=colour,
            width=44,
        )


SUBJECTS = (
    ("rainbow", "#f2f2f2", _rainbow_arcs),
    ("ocean", "#3aa0e8", _ocean),
    ("lava", "#7a2f2f", _lava),
    ("twotone", "#2f4f8f", _two_tone),
)


def main(out_dir: Path) -> int:
    out_dir.mkdir(parents=True, exist_ok=True)
    with Server() as server:
        planets = {
            label: server.upload(
                label.title(),
                artwork=_disc(background, paint),
                body_color=background,
            )
            for label, background, paint in SUBJECTS
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
            page.screenshot(path=str(out_dir / "scene.png"))

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
    target = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("/tmp/look")
    raise SystemExit(main(target))
