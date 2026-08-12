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

import io
import sys
import time
from pathlib import Path

import httpx
from PIL import Image, ImageDraw
from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).resolve().parent))
from check_projector import Server  # noqa: E402

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


SUBJECTS = (
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
            page.goto(f"{server.base}/", wait_until="networkidle")
            page.wait_for_timeout(9000)
            page.screenshot(path=str(out_dir / "scene.png"))
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
