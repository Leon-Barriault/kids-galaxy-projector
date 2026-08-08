#!/usr/bin/env python3
"""
Smoke test for the projector page.

`static/galaxy.js` is the one part of this project with no unit tests: it needs
a WebGL context, a live server and a real EventSource, so there is nothing to
fake it with. This drives the real page in headless Chromium against a real
server instead, and asserts the behaviours that have actually broken before:

  * a page load produces exactly one planet per stored drawing - the SSE stream
    primes every new subscriber with the current planet, so the newest one
    arrives twice and must be deduplicated
  * a live upload appears without a reload
  * a delete removes the planet from the sky
  * the gallery is capped, and the planet dropped is the oldest
  * orbits are derived from the planet id, so a reload reproduces the same sky
  * a clear-all empties the sky in one event and the page still works after
  * nothing is logged to the console as an error

Run it with `make check-projector` (needs playwright + chromium, which CI does
not install - this is a local pre-push check, not a CI gate).
"""

from __future__ import annotations

import io
import shutil
import socket
import subprocess
import sys
import tempfile
import time
from pathlib import Path

import httpx
from PIL import Image
from playwright.sync_api import sync_playwright

REPO_ROOT = Path(__file__).resolve().parent.parent
SERVER_DIR = REPO_ROOT / "pi-server"


def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def png_bytes(colour: tuple[int, int, int]) -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", (64, 64), colour).save(buffer, format="PNG")
    return buffer.getvalue()


class Server:
    """uvicorn against a throwaway upload directory."""

    def __init__(self) -> None:
        self.port = free_port()
        self.uploads = Path(tempfile.mkdtemp(prefix="kg-projector-"))
        self.base = f"http://127.0.0.1:{self.port}"
        self._process: subprocess.Popen | None = None

    def __enter__(self) -> "Server":
        env = {
            "PATH": "/usr/bin:/bin:/usr/local/bin",
            "PYTHONPATH": str(SERVER_DIR),
            "UPLOAD_DIR": str(self.uploads),
            "STATIC_DIR": str(SERVER_DIR / "static"),
            "RATE_LIMIT_SECONDS": "0",
            "ENVIRONMENT": "development",
        }
        self._process = subprocess.Popen(
            [sys.executable, "-m", "uvicorn", "main:app", "--port", str(self.port)],
            cwd=SERVER_DIR,
            env=env,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        deadline = time.time() + 30
        while time.time() < deadline:
            try:
                if httpx.get(f"{self.base}/health", timeout=1).status_code == 200:
                    return self
            except httpx.HTTPError:
                time.sleep(0.2)
        raise RuntimeError("server did not start")

    def __exit__(self, *_exc: object) -> None:
        if self._process:
            self._process.terminate()
            self._process.wait(timeout=10)
        shutil.rmtree(self.uploads, ignore_errors=True)

    def upload(self, name: str, colour: tuple[int, int, int] = (200, 30, 30)) -> str:
        response = httpx.post(
            f"{self.base}/api/upload",
            files={"file": ("planet.png", png_bytes(colour), "image/png")},
            data={"name": name},
            timeout=10,
        )
        response.raise_for_status()
        return response.json()["planet_id"]

    def delete(self, planet_id: str) -> int:
        return httpx.delete(f"{self.base}/api/planets/{planet_id}", timeout=10).status_code

    def clear(self) -> int:
        return httpx.delete(f"{self.base}/api/planets", timeout=10).status_code


FAILURES: list[str] = []


def check(condition: bool, description: str) -> None:
    print(f"  {'PASS' if condition else 'FAIL'}  {description}")
    if not condition:
        FAILURES.append(description)


def wait_for(page, expression: str, timeout_ms: int = 8000) -> None:
    try:
        page.wait_for_function(expression, timeout=timeout_ms)
    except Exception:  # noqa: BLE001 - the assertion below reports the detail
        pass


def planet_ids(page) -> list[str]:
    return page.evaluate("Array.from(window.kidsGalaxy.kidPlanets.keys())")


def main() -> int:
    with Server() as server, sync_playwright() as pw:
        first = server.upload("Alpha", (220, 40, 40))
        second = server.upload("Beta", (40, 220, 40))
        third = server.upload("Gamma", (40, 40, 220))

        browser = pw.chromium.launch(args=["--use-gl=swiftshader", "--enable-unsafe-swiftshader"])
        page = browser.new_page()
        errors: list[str] = []
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append(str(e)))

        print("\nload")
        page.goto(f"{server.base}/", wait_until="load")
        wait_for(page, "window.kidsGalaxy && window.kidsGalaxy.kidPlanets.size === 3")
        ids = planet_ids(page)
        check(len(ids) == 3, f"three stored drawings produce three planets (got {len(ids)})")
        check(len(set(ids)) == len(ids), "no duplicate planet is created by the SSE priming frame")
        check(set(ids) == {first, second, third}, "the three planets are the three that were stored")

        print("\nlive arrival over SSE")
        fourth = server.upload("Delta", (220, 220, 40))
        wait_for(page, "window.kidsGalaxy.kidPlanets.size === 4")
        check(fourth in planet_ids(page), "a planet uploaded while the page is open appears")

        print("\ndeletion over SSE")
        check(server.delete(second) == 200, "DELETE returns 200")
        wait_for(page, "window.kidsGalaxy.kidPlanets.size === 3")
        check(second not in planet_ids(page), "the deleted planet leaves the sky")
        check(first in planet_ids(page), "the other planets are untouched")

        print("\norbit determinism across a reload")
        before = page.evaluate(
            "Object.fromEntries(Array.from(window.kidsGalaxy.kidPlanets.entries())"
            ".map(([k, v]) => [k, [v.a, v.e, v.i, v.M0]]))"
        )
        page.reload(wait_until="load")
        wait_for(page, "window.kidsGalaxy && window.kidsGalaxy.kidPlanets.size === 3")
        after = page.evaluate(
            "Object.fromEntries(Array.from(window.kidsGalaxy.kidPlanets.entries())"
            ".map(([k, v]) => [k, [v.a, v.e, v.i, v.M0]]))"
        )
        check(before == after, "every planet keeps the same orbit after a reload")

        print("\ngallery cap and eviction order")
        cap = page.evaluate("window.kidsGalaxy.GALLERY_SIZE")
        oldest_remaining = first
        for i in range(cap):
            server.upload(f"Filler {i}")
        wait_for(page, f"window.kidsGalaxy.kidPlanets.size === {cap}", timeout_ms=20000)
        ids = planet_ids(page)
        check(len(ids) == cap, f"the sky is capped at {cap} planets (got {len(ids)})")
        check(oldest_remaining not in ids, "the oldest planet is the one evicted")

        print("\nclear all")
        check(server.clear() == 200, "DELETE /api/planets returns 200")
        wait_for(page, "window.kidsGalaxy.kidPlanets.size === 0")
        check(planet_ids(page) == [], "the whole sky empties on one clear event")
        server.upload("After The Clear")
        wait_for(page, "window.kidsGalaxy.kidPlanets.size === 1")
        check(len(planet_ids(page)) == 1, "planets can arrive again afterwards")

        print("\nconsole")
        check(errors == [], f"no console errors ({errors[:3]})")

        browser.close()

    print()
    if FAILURES:
        print(f"{len(FAILURES)} check(s) failed:")
        for failure in FAILURES:
            print(f"  - {failure}")
        return 1
    print("projector smoke test passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
