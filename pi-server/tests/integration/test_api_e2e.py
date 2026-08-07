"""
Integration / end-to-end tests.

These exercise the real FastAPI application through TestClient:
  upload → current-planet → serve texture → health / static page.

They validate the full request/response cycle, validation, rate limiting,
and security controls without requiring a running Raspberry Pi or projector.
"""

from pathlib import Path

import pytest
from main import MAX_FILE_SIZE, UPLOAD_DIR


class TestHealth:
    def test_health_ok(self, client):
        r = client.get("/health")
        assert r.status_code == 200
        data = r.json()
        assert data["status"] == "ok"
        assert data["service"] == "kids-galaxy-projector"


class TestGalaxyPage:
    def test_index_served(self, client):
        r = client.get("/")
        # 200 when static/index.html is present (normal), 404 only if missing
        assert r.status_code in (200, 404)


class TestUploadValidation:
    def test_reject_empty_file(self, client):
        r = client.post(
            "/api/upload",
            files={"file": ("empty.png", b"", "image/png")},
            data={"name": "Empty"},
        )
        assert r.status_code == 400

    def test_reject_non_image(self, client):
        r = client.post(
            "/api/upload",
            files={"file": ("evil.txt", b"not an image", "text/plain")},
            data={"name": "Bad"},
        )
        assert r.status_code == 400

    def test_reject_oversized(self, client):
        big = b"\x89PNG\r\n\x1a\n" + b"x" * (MAX_FILE_SIZE + 1000)
        r = client.post(
            "/api/upload",
            files={"file": ("big.png", big, "image/png")},
            data={"name": "Huge"},
        )
        assert r.status_code == 400

    def test_rate_limit(self, client, make_png_bytes):
        png = make_png_bytes()
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


class TestServeUploadSecurity:
    def test_path_traversal_blocked(self, client):
        r = client.get("/uploads/../../etc/passwd")
        assert r.status_code in (404, 400)

    def test_missing_planet_404(self, client):
        r = client.get("/uploads/does-not-exist-xyz.png")
        assert r.status_code == 404


class TestEndToEndPlanetFlow:
    """
    True end-to-end path:
      1. Upload a valid planet drawing
      2. Query /api/current-planet and see it
      3. Fetch the texture URL and receive a valid image
    """

    def test_png_upload_then_visible_in_galaxy(self, client, make_png_bytes):
        png = make_png_bytes(color=(30, 144, 255))  # dodger blue

        # 1. Upload
        upload = client.post(
            "/api/upload",
            files={"file": ("kid_planet.png", png, "image/png")},
            data={"name": "Kid Blue Planet"},
        )
        assert upload.status_code == 200, upload.text
        body = upload.json()
        assert body["status"] == "success"
        assert body["name"] == "Kid Blue Planet"
        assert "planet_id" in body
        texture_url = body["url"]
        assert texture_url.startswith("/uploads/")
        assert texture_url.endswith(".png")

        # 2. current-planet endpoint must now report a planet
        current = client.get("/api/current-planet")
        assert current.status_code == 200
        current_data = current.json()
        assert current_data["has_planet"] is True
        assert "url" in current_data
        # The latest planet should match what we just uploaded
        assert current_data["url"] == texture_url or texture_url in current_data["url"]

        # 3. Serve the texture – end-to-end delivery of the image
        texture = client.get(texture_url)
        assert texture.status_code == 200
        assert texture.headers.get("content-type", "").startswith("image/")
        assert len(texture.content) > 50  # non-trivial image payload

        # Optional cleanup so later runs stay clean
        filename = Path(texture_url).name
        saved = UPLOAD_DIR / filename
        if saved.exists():
            saved.unlink(missing_ok=True)

    def test_jpeg_upload_roundtrip(self, client, make_jpeg_bytes):
        jpeg = make_jpeg_bytes()

        upload = client.post(
            "/api/upload",
            files={"file": ("planet.jpg", jpeg, "image/jpeg")},
            data={"name": "Orange World"},
        )
        assert upload.status_code == 200
        data = upload.json()
        assert data["status"] == "success"
        assert data["name"] == "Orange World"

        texture = client.get(data["url"])
        assert texture.status_code == 200
        assert texture.headers.get("content-type", "").startswith("image/")

        # Cleanup
        filename = Path(data["url"]).name
        (UPLOAD_DIR / filename).unlink(missing_ok=True)
