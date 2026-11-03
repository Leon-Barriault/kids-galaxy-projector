#!/usr/bin/env python3
"""The open wall must show a new planet after a graceful server restart.

QA: restarting the server container left the wall's event stream held by the
old process. After that the page stopped asking, and a planet drawn once the
server was back never appeared. A forced kill recovered in about three
seconds. This drives the graceful case in a real browser, without reloading
the page.
"""

from __future__ import annotations

import os
import signal
import subprocess
import sys
import tempfile
import time
from pathlib import Path

from _projector_deps import require as _require_projector_dependencies

_require_projector_dependencies()

import httpx
from playwright.sync_api import sync_playwright

from check_projector import chromium_executable, drawing_manifest_bytes, free_port, png_bytes

REPO_ROOT = Path(__file__).resolve().parent.parent
SERVER_DIR = REPO_ROOT / "pi-server"
GRACEFUL_STOP_SECONDS = 4.0
PLANET_APPEAR_MS = 12_000


class WallServer:
    def __init__(self) -> None:
        self.port = free_port()
        self.root = Path(tempfile.mkdtemp(prefix="kg-reconnect-"))
        self.uploads = self.root / "uploads"
        self.state = self.root / "state"
        self.base = f"http://127.0.0.1:{self.port}"
        self.process: subprocess.Popen | None = None
        self._log = None
        self.log_path = self.root / "uvicorn.log"

    def start(self) -> None:
        if self._log is not None:
            self._log.close()
        self._log = self.log_path.open("a", encoding="utf-8")
        env = {
            **os.environ,
            "PYTHONPATH": str(SERVER_DIR),
            "UPLOAD_DIR": str(self.uploads),
            "STATE_DIR": str(self.state),
            "STATIC_DIR": str(SERVER_DIR / "static"),
            "RATE_LIMIT_SECONDS": "0",
            "ENVIRONMENT": "development",
            "ADVERTISE": "false",
        }
        self.process = subprocess.Popen(
            [
                sys.executable,
                "-m",
                "uvicorn",
                "main:app",
                "--host",
                "127.0.0.1",
                "--port",
                str(self.port),
            ],
            cwd=SERVER_DIR,
            env=env,
            stdout=self._log,
            stderr=subprocess.STDOUT,
        )
        deadline = time.monotonic() + 20
        while time.monotonic() < deadline:
            if self.process.poll() is not None:
                raise RuntimeError(f"server exited early\n{self.output()}")
            try:
                if httpx.get(f"{self.base}/health", timeout=1).status_code == 200:
                    return
            except httpx.HTTPError:
                time.sleep(0.1)
        raise RuntimeError(f"server did not start\n{self.output()}")

    def stop_gracefully(self, timeout: float) -> bool:
        """SIGTERM, like Docker's normal stop. True only if the process exits in time."""
        if self.process is None or self.process.poll() is not None:
            return False
        self.process.send_signal(signal.SIGTERM)
        try:
            # Uvicorn re-raises SIGTERM after a clean shutdown, so the status
            # is the signal rather than zero. A hang leaves the process running.
            return self.process.wait(timeout=timeout) in (0, -signal.SIGTERM)
        except subprocess.TimeoutExpired:
            return False

    def kill(self) -> None:
        if self.process is not None and self.process.poll() is None:
            self.process.kill()
            self.process.wait(timeout=5)
        if self._log is not None:
            self._log.close()
            self._log = None

    def output(self) -> str:
        if self._log is not None:
            self._log.flush()
        if not self.log_path.exists():
            return ""
        return self.log_path.read_text(encoding="utf-8", errors="replace")[-4000:]

    def upload(self, name: str) -> str:
        response = httpx.post(
            f"{self.base}/api/upload",
            files={
                "file": ("planet.png", png_bytes((20, 180, 90)), "image/png"),
                "manifest": (
                    "drawing.json",
                    drawing_manifest_bytes("#14b45a"),
                    "application/json",
                ),
            },
            data={"name": name},
            timeout=10,
        )
        response.raise_for_status()
        return response.json()["planet_id"]


def launch_browser(playwright):
    args = ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"]
    executable = chromium_executable()
    try:
        return playwright.chromium.launch(executable_path=executable, args=args)
    except Exception:
        chrome = os.environ.get("CHROME_PATH", "/usr/local/bin/google-chrome")
        if Path(chrome).is_file():
            return playwright.chromium.launch(executable_path=chrome, args=args)
        raise


def main() -> int:
    server = WallServer()
    failures: list[str] = []

    def check(condition: bool, description: str) -> None:
        print(f"  {'PASS' if condition else 'FAIL'}  {description}")
        if not condition:
            failures.append(description)

    try:
        server.start()
        with sync_playwright() as playwright:
            browser = launch_browser(playwright)
            page = browser.new_page(viewport={"width": 1280, "height": 720})
            event_responses: list[str] = []
            page.on(
                "response",
                lambda response: event_responses.append(response.url)
                if response.url.endswith("/api/events")
                else None,
            )
            page.goto(server.base + "/", wait_until="domcontentloaded", timeout=20_000)
            page.wait_for_function(
                "() => window.kidsGalaxy && window.kidsGalaxy.kidPlanets",
                timeout=20_000,
            )
            deadline = time.monotonic() + 10
            while not event_responses and time.monotonic() < deadline:
                page.wait_for_timeout(100)
            check(bool(event_responses), "wall opened its live event stream")

            released = server.stop_gracefully(GRACEFUL_STOP_SECONDS)
            check(
                released,
                f"graceful stop releases the wall connection within {GRACEFUL_STOP_SECONDS:.0f}s",
            )
            if not released:
                print(server.output())
                server.kill()

            server.start()
            server.upload("After Restart")
            try:
                page.wait_for_function(
                    "() => window.kidsGalaxy.kidPlanets.size >= 1",
                    timeout=PLANET_APPEAR_MS,
                )
                visible = True
            except Exception as exc:  # noqa: BLE001 - reported as the check failure
                visible = False
                print(f"planet did not appear: {exc}")
                print(server.output())
            check(visible, "new planet appears on the open wall without a reload")
            browser.close()
    except Exception as exc:  # noqa: BLE001 - the script's result is the failure list
        failures.append(f"reconnect check crashed: {exc}")
        print(server.output())
    finally:
        server.kill()

    print()
    if failures:
        print(f"{len(failures)} reconnect check(s) failed:")
        for failure in failures:
            print(f"  - {failure}")
        return 1
    print("projector reconnect check passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
