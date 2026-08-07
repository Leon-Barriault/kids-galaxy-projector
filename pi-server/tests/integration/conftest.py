"""
Integration-only fixtures.

Builds a real application through the composition root, pointed at an isolated
temp directory. Because the app is created per test, suites no longer share
upload state or rate-limit state - which is what previously forced tests to
clean up after themselves.
"""

import io

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.config import Settings
from app.factory import create_app


@pytest.fixture
def settings(tmp_path):
    """Isolated settings: uploads go to a temp dir, cooldown effectively off."""
    return Settings(
        upload_dir=tmp_path / "uploads",
        static_dir=tmp_path / "static",
        rate_limit_seconds=0.0,
        environment="development",
    )


@pytest.fixture
def app(settings):
    return create_app(settings)


@pytest.fixture
def client(app):
    return TestClient(app)


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
    """Upload a planet and return the parsed response body."""

    def _upload(name: str = "Test Planet", png: bytes | None = None):
        response = client.post(
            "/api/upload",
            files={"file": ("planet.png", png or make_png_bytes(), "image/png")},
            data={"name": name},
        )
        assert response.status_code == 200, response.text
        return response.json()

    return _upload
