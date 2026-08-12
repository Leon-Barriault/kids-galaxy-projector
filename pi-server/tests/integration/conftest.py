"""Integration-only fixtures for the manifest-first planet contract."""

import io
import json

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.config import Settings
from app.factory import create_app


def _manifest(background: str = "#ff0000") -> bytes:
    return json.dumps(
        {
            "version": 1,
            "coordinate_space": "normalized-canvas-v1",
            "canvas": {"width": 64, "height": 64},
            "background_color": background.lower(),
            "background_explicit": True,
            "strokes": [
                {
                    "order": 0,
                    "color": "#7b1fa2",
                    "width_px": 8,
                    "width_normalized": 0.125,
                    "points": [[0.12, 0.16], [0.5, 0.18], [0.88, 0.15]],
                },
                {
                    "order": 1,
                    "color": "#f57c00",
                    "width_px": 7,
                    "width_normalized": 0.109375,
                    "points": [[0.18, 0.43], [0.5, 0.46], [0.82, 0.42]],
                },
            ],
            "raster": {
                "background_fill": "solid",
                "stroke_cap": "round",
                "stroke_join": "round",
                "stroke_order": "oldest-to-newest",
            },
        }
    ).encode()


_ORIGINAL_TESTCLIENT_POST = TestClient.post


def _manifest_post(self, url, *args, **kwargs):
    """Make the modern tablet wire format the default across integration tests."""
    if url == "/api/upload" and "files" in kwargs:
        files = kwargs["files"]
        if isinstance(files, dict):
            has_manifest = "manifest" in files
        else:
            has_manifest = any(item[0] == "manifest" for item in files)

        if not has_manifest:
            data = kwargs.get("data") or {}
            background = data.get("body_color", "#ff0000") if isinstance(data, dict) else "#ff0000"
            manifest_file = (
                "drawing-manifest.json",
                _manifest(background),
                "application/json",
            )
            if isinstance(files, dict):
                kwargs["files"] = {**files, "manifest": manifest_file}
            else:
                kwargs["files"] = [*files, ("manifest", manifest_file)]
    return _ORIGINAL_TESTCLIENT_POST(self, url, *args, **kwargs)


# Tests that construct TestClient directly should still exercise today's wire
# contract. The one test that deliberately omits a manifest uses RawTestClient.
TestClient.post = _manifest_post


class RawTestClient(TestClient):
    def post(self, url, *args, **kwargs):
        return _ORIGINAL_TESTCLIENT_POST(self, url, *args, **kwargs)


@pytest.fixture
def settings(tmp_path):
    """Isolated settings: uploads go to a temp dir, cooldown effectively off."""
    return Settings(
        upload_dir=tmp_path / "uploads",
        static_dir=tmp_path / "static",
        rate_limit_seconds=0.0,
        environment="development",
        advertise=False,
    )


@pytest.fixture
def app(settings):
    return create_app(settings)


@pytest.fixture
def client(app):
    return TestClient(app)


@pytest.fixture
def raw_client(app):
    """Unmodified HTTP client for testing the upload wire contract itself."""
    return RawTestClient(app)


@pytest.fixture
def repository(app):
    return app.state.repository


@pytest.fixture
def publisher(app):
    return app.state.publisher


@pytest.fixture
def make_png_bytes():
    def _factory(width: int = 64, height: int = 64, color=(255, 0, 0)) -> bytes:
        img = Image.new("RGB", (width, height), color)
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        return buf.getvalue()

    return _factory


@pytest.fixture
def make_jpeg_bytes():
    def _factory(width: int = 64, height: int = 64, color=(0, 128, 255)) -> bytes:
        img = Image.new("RGB", (width, height), color)
        buf = io.BytesIO()
        img.save(buf, format="JPEG")
        return buf.getvalue()

    return _factory


@pytest.fixture
def upload_planet(client, make_png_bytes):
    """Upload a modern manifest-backed planet and return its response body."""

    def _upload(name: str = "Test Planet", png: bytes | None = None):
        response = client.post(
            "/api/upload",
            files={"file": ("planet.png", png or make_png_bytes(), "image/png")},
            data={"name": name},
        )
        assert response.status_code == 200, response.text
        return response.json()

    return _upload
