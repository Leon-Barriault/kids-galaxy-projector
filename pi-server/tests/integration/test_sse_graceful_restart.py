"""The projector wall must survive a graceful server restart.

A normal stop (container restart, update, rollback) delivers SIGTERM. Uvicorn
then waits until every response finishes before exiting. The wall's event
stream never finishes, so the process holds that socket until something kills
it. The browser keeps treating the socket as open and stops asking for planets.

Forced kill resets the socket, and the browser recovers on its own. This test
is the graceful case: the stream has to end, and the process has to exit,
while the wall is still connected.
"""

from __future__ import annotations

import http.client
import io
import json
import os
import signal
import socket
import subprocess
import sys
import time
from pathlib import Path

import httpx2
import pytest
from PIL import Image

SERVER_DIR = Path(__file__).resolve().parents[2]
STREAM_RELEASE_SECONDS = 3.0


def _free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def _png() -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", (32, 32), (20, 180, 90)).save(buffer, format="PNG")
    return buffer.getvalue()


def _manifest() -> bytes:
    return json.dumps(
        {
            "version": 1,
            "coordinate_space": "normalized-canvas-v1",
            "canvas": {"width": 32, "height": 32},
            "background_color": "#14b45a",
            "background_explicit": True,
            "strokes": [
                {
                    "order": 0,
                    "color": "#7b1fa2",
                    "width_px": 4,
                    "width_normalized": 0.125,
                    "points": [[0.2, 0.2], [0.8, 0.8]],
                }
            ],
            "raster": {
                "background_fill": "solid",
                "stroke_cap": "round",
                "stroke_join": "round",
                "stroke_order": "oldest-to-newest",
            },
        }
    ).encode()


class _Server:
    def __init__(self, tmp_path: Path, port: int):
        self.port = port
        self.base = f"http://127.0.0.1:{port}"
        self.log_path = tmp_path / "uvicorn.log"
        self._log = self.log_path.open("w", encoding="utf-8")
        env = {
            **os.environ,
            "PYTHONPATH": str(SERVER_DIR),
            "UPLOAD_DIR": str(tmp_path / "uploads"),
            "STATE_DIR": str(tmp_path / "state"),
            "STATIC_DIR": str(tmp_path / "static"),
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
                str(port),
            ],
            cwd=SERVER_DIR,
            env=env,
            stdout=self._log,
            stderr=subprocess.STDOUT,
        )

    def wait_until_healthy(self, timeout: float = 15.0) -> None:
        deadline = time.monotonic() + timeout
        last_error = "no response"
        while time.monotonic() < deadline:
            if self.process.poll() is not None:
                raise AssertionError(f"server exited early\n{self.output()}")
            try:
                conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=1)
                conn.request("GET", "/health")
                response = conn.getresponse()
                body = response.read()
                conn.close()
                if response.status == 200 and b"ok" in body:
                    return
                last_error = f"HTTP {response.status} {body!r}"
            except OSError as exc:
                last_error = str(exc)
            time.sleep(0.1)
        raise AssertionError(f"server did not become healthy: {last_error}\n{self.output()}")

    def output(self) -> str:
        self._log.flush()
        return self.log_path.read_text(encoding="utf-8", errors="replace")[-4000:]

    def close(self) -> None:
        if self.process.poll() is None:
            self.process.kill()
            self.process.wait(timeout=5)
        self._log.close()


def _read_open_stream(
    port: int,
) -> tuple[http.client.HTTPConnection, http.client.HTTPResponse, str]:
    """Hold the wall's event stream open, past the initial planet frame."""
    conn = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
    conn.request("GET", "/api/events", headers={"Accept": "text/event-stream"})
    response = conn.getresponse()
    assert response.status == 200, response.status
    prelude = ""
    while "event: planet" not in prelude or not prelude.endswith("\n\n"):
        line = response.readline()
        if not line:
            raise AssertionError(f"event stream ended before the first planet\n{prelude}")
        prelude += line.decode()
        if len(prelude) > 20_000:
            raise AssertionError(prelude)
    return conn, response, prelude


def test_graceful_stop_releases_the_wall_stream_and_a_new_planet_is_visible(tmp_path: Path):
    port = _free_port()
    server = _Server(tmp_path, port)
    conn: http.client.HTTPConnection | None = None
    try:
        server.wait_until_healthy()
        conn, response, prelude = _read_open_stream(port)
        assert "text/event-stream" in response.headers.get("content-type", "")
        assert "retry: 1000" in prelude

        # The wall is blocked in a read. A graceful stop has to finish this
        # response; otherwise the process sits here until it is killed.
        assert conn.sock is not None
        conn.sock.settimeout(STREAM_RELEASE_SECONDS)
        server.process.send_signal(signal.SIGTERM)
        started = time.monotonic()
        timed_out = False
        try:
            while True:
                line = response.readline()
                if line == b"":
                    break
        except TimeoutError:
            timed_out = True
        held_for = time.monotonic() - started
        assert not timed_out and held_for < STREAM_RELEASE_SECONDS, (
            "graceful stop left the wall's event stream open for "
            f"{held_for:.1f}s\n{server.output()}"
        )

        try:
            exit_code = server.process.wait(timeout=STREAM_RELEASE_SECONDS)
        except subprocess.TimeoutExpired:
            pytest.fail(
                "server was still running after SIGTERM while the wall was connected\n"
                + server.output()
            )
        # Uvicorn finishes the shutdown, then re-raises SIGTERM so the process
        # status is the signal Docker sent. That is a clean stop, not a hang.
        assert exit_code in (0, -signal.SIGTERM), server.output()
    finally:
        if conn is not None:
            conn.close()
        if server.process.poll() is None:
            server.close()
        else:
            server._log.close()

    restarted = _Server(tmp_path, port)
    try:
        restarted.wait_until_healthy()
        uploaded = httpx2.post(
            f"{restarted.base}/api/upload",
            files={
                "file": ("planet.png", _png(), "image/png"),
                "manifest": ("drawing.json", _manifest(), "application/json"),
            },
            data={"name": "After Restart"},
            timeout=5,
        )
        assert uploaded.status_code == 200, uploaded.text
        planet_id = uploaded.json()["planet_id"]

        follow, follow_response, follow_prelude = _read_open_stream(port)
        try:
            assert planet_id in follow_prelude
            assert "After Restart" in follow_prelude
        finally:
            follow.close()
            follow_response.close()
    finally:
        restarted.process.send_signal(signal.SIGTERM)
        try:
            restarted.process.wait(timeout=STREAM_RELEASE_SECONDS)
        except subprocess.TimeoutExpired:
            restarted.close()
        else:
            restarted._log.close()
