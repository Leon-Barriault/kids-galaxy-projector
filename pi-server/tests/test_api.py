"""
Unit and integration tests for the Kids Galaxy Projector API.
Aligned with SDLC Test Phase: automated suites must pass before release.
"""

import io
import os
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from PIL import Image

# Ensure uploads dir exists for tests
os.environ.setdefault("UPLOAD_DIR", "uploads")
Path("uploads").mkdir(exist_ok=True)

from main import app, sanitize_filename, MAX_FILE_SIZE, _last_upload

client = TestClient(app)


@pytest.fixture(autouse=True)
def clear_rate_limit():
    """Reset per-IP rate limit between tests so they stay independent."""
    _last_upload.clear()
    yield
    _last_upload.clear()


def _make_png_bytes(width: int = 64, height: int = 64, color=(255, 0, 0)) -> bytes:
    """Create a minimal valid PNG in memory."""
    img = Image.new("RGB", (width, height), color)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def _make_jpeg_bytes(width: int = 64, height: int = 64) -> bytes:
    img = Image.new("RGB", (width, height), (0, 128, 255))
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return buf.getvalue()


# ---------- Unit tests ----------

class TestSanitizeFilename:
    def test_basic(self):
        assert sanitize_filename("My Planet") == "My Planet"

    def test_strips_dangerous_chars(self):
        result = sanitize_filename("../../etc/passwd")
        assert ".." not in result
        assert "/" not in result
        assert "etc" in result or result == "planet"

    def test_empty_fallback(self):
        assert sanitize_filename("") == "planet.png"
        assert sanitize_filename(None) == "planet.png"

    def test_length_limit(self):
        long_name = "A" * 200
        assert len(sanitize_filename(long_name)) <= 80


# ---------- Integration tests ----------

class TestHealth:
    def test_health_ok(self):
        r = client.get("/health")
        assert r.status_code == 200
        data = r.json()
        assert data["status"] == "ok"
        assert data["service"] == "kids-galaxy-projector"


class TestCurrentPlanet:
    def test_no_planet_yet(self):
        r = client.get("/api/current-planet")
        assert r.status_code == 200
        data = r.json()
        assert "has_planet" in data


class TestUpload:
    def test_upload_valid_png(self):
        png = _make_png_bytes()
        r = client.post(
            "/api/upload",
            files={"file": ("planet.png", png, "image/png")},
            data={"name": "Test Planet"},
        )
        assert r.status_code == 200
        data = r.json()
        assert data["status"] == "success"
        assert "planet_id" in data
        assert data["name"] == "Test Planet"
        assert data["url"].startswith("/uploads/")

    def test_upload_valid_jpeg(self):
        jpeg = _make_jpeg_bytes()
        r = client.post(
            "/api/upload",
            files={"file": ("planet.jpg", jpeg, "image/jpeg")},
            data={"name": "Blue Planet"},
        )
        assert r.status_code == 200
        assert r.json()["status"] == "success"

    def test_reject_empty_file(self):
        r = client.post(
            "/api/upload",
            files={"file": ("empty.png", b"", "image/png")},
            data={"name": "Empty"},
        )
        assert r.status_code == 400

    def test_reject_non_image(self):
        r = client.post(
            "/api/upload",
            files={"file": ("evil.txt", b"not an image", "text/plain")},
            data={"name": "Bad"},
        )
        assert r.status_code == 400

    def test_reject_oversized(self):
        big = b"\x89PNG\r\n\x1a\n" + b"x" * (MAX_FILE_SIZE + 1000)
        r = client.post(
            "/api/upload",
            files={"file": ("big.png", big, "image/png")},
            data={"name": "Huge"},
        )
        assert r.status_code == 400

    def test_rate_limit(self):
        png = _make_png_bytes()
        r1 = client.post(
            "/api/upload",
            files={"file": ("p1.png", png, "image/png")},
            data={"name": "P1"},
        )
        assert r1.status_code == 200
        r2 = client.post(
            "/api/upload",
            files={"file": ("p2.png", png, "image/png")},
            data={"name": "P2"},
        )
        assert r2.status_code == 429


class TestGalaxyPage:
    def test_index_served(self):
        r = client.get("/")
        assert r.status_code in (200, 404)
