"""Focused end-to-end HTTP contracts for the manifest-first planet flow.

Detailed rendering belongs to the real Chromium projector tests. This module
protects the HTTP lifecycle and storage shape without duplicating lower-level
unit tests or retired raster-rendering behavior.
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.config import Settings
from app.factory import create_app


class TestHealthAndDiscovery:
    def test_health_ok(self, client):
        assert client.get("/health").json() == {
            "status": "ok",
            "service": "kids-galaxy-projector",
        }

    def test_galaxy_identity_is_public_and_stable(self, client):
        first = client.get("/api/galaxy")
        second = client.get("/api/galaxy")
        assert first.status_code == 200
        assert first.json() == second.json()
        assert first.json()["service"] == "kids-galaxy-projector"

    def test_configured_galaxy_name_is_reported(self, tmp_path):
        app = create_app(
            Settings(
                upload_dir=tmp_path / "uploads",
                static_dir=tmp_path / "static",
                galaxy_name="Library Galaxy",
                advertise=False,
            )
        )
        assert TestClient(app).get("/api/galaxy").json()["name"] == "Library Galaxy"


class TestUploadValidation:
    def test_rejects_empty_file(self, client):
        response = client.post(
            "/api/upload",
            files={"file": ("empty.png", b"", "image/png")},
            data={"name": "Empty"},
        )
        assert response.status_code == 400

    def test_rejects_non_image(self, client):
        response = client.post(
            "/api/upload",
            files={"file": ("bad.txt", b"not an image", "text/plain")},
            data={"name": "Bad"},
        )
        assert response.status_code == 400

    def test_rejected_upload_does_not_consume_cooldown(self, tmp_path, make_png_bytes):
        app = create_app(
            Settings(
                upload_dir=tmp_path / "uploads",
                static_dir=tmp_path / "static",
                rate_limit_seconds=60.0,
                advertise=False,
            )
        )
        client = TestClient(app)
        rejected = client.post(
            "/api/upload",
            files={"file": ("bad.png", b"not an image", "image/png")},
            data={"name": "Broken"},
        )
        accepted = client.post(
            "/api/upload",
            files={"file": ("good.png", make_png_bytes(), "image/png")},
            data={"name": "Retry"},
        )
        assert rejected.status_code == 400
        assert accepted.status_code == 200


class TestManifestBackedPlanetFlow:
    def test_upload_exposes_png_and_manifest(self, client, make_png_bytes):
        upload = client.post(
            "/api/upload",
            files={"file": ("planet.png", make_png_bytes(color=(30, 144, 255)), "image/png")},
            data={"name": "Blue Planet"},
        )
        assert upload.status_code == 200, upload.text
        body = upload.json()
        assert body["url"].endswith(".png")
        assert body["drawing_manifest_url"].endswith(".drawing.json")
        assert client.get(body["url"]).status_code == 200
        assert client.get(body["drawing_manifest_url"]).status_code == 200

        current = client.get("/api/current-planet").json()
        assert current["id"] == body["planet_id"]
        assert current["drawing_manifest_url"] == body["drawing_manifest_url"]

    def test_jpeg_archival_input_is_normalized_to_png(self, client, make_jpeg_bytes):
        response = client.post(
            "/api/upload",
            files={"file": ("planet.jpg", make_jpeg_bytes(), "image/jpeg")},
            data={"name": "JPEG Planet"},
        )
        assert response.status_code == 200
        assert response.json()["url"].endswith(".png")

    def test_gallery_is_newest_first_and_manifest_backed(self, client, upload_planet):
        upload_planet("First")
        upload_planet("Second")
        upload_planet("Third")
        planets = client.get("/api/planets").json()["planets"]
        assert [planet["name"] for planet in planets] == ["Third", "Second", "First"]
        assert all(planet["drawing_manifest_url"].endswith(".drawing.json") for planet in planets)

    def test_current_planet_is_empty_before_upload(self, client):
        assert client.get("/api/current-planet").json() == {"has_planet": False}


class TestRetentionAndLifecycle:
    def test_retention_keeps_complete_planet_sets(self, tmp_path, make_png_bytes):
        settings = Settings(
            upload_dir=tmp_path / "uploads",
            static_dir=tmp_path / "static",
            rate_limit_seconds=0.0,
            max_stored_planets=3,
            advertise=False,
        )
        client = TestClient(create_app(settings))
        for index in range(6):
            response = client.post(
                "/api/upload",
                files={"file": ("planet.png", make_png_bytes(), "image/png")},
                data={"name": f"Planet {index}"},
            )
            assert response.status_code == 200

        assert len(client.get("/api/planets?limit=999").json()["planets"]) == 3
        assert len(list(settings.upload_dir.glob("*.png"))) == 3
        assert len(list(settings.upload_dir.glob("*.drawing.json"))) == 3
        metadata = [
            path
            for path in settings.upload_dir.glob("*.json")
            if not path.name.endswith(".drawing.json")
        ]
        assert len(metadata) == 3

    def test_delete_removes_png_manifest_and_gallery_entry(self, client, upload_planet, settings):
        keep = upload_planet("Keep")
        drop = upload_planet("Drop")
        response = client.delete(f"/api/planets/{drop['planet_id']}")
        assert response.status_code == 200
        assert [planet["id"] for planet in client.get("/api/planets").json()["planets"]] == [
            keep["planet_id"]
        ]
        assert client.get(drop["url"]).status_code == 404
        assert client.get(drop["drawing_manifest_url"]).status_code == 404
        assert len(list(settings.upload_dir.glob("*.png"))) == 1
        assert len(list(settings.upload_dir.glob("*.drawing.json"))) == 1

    def test_clear_removes_every_planet_and_sidecar(self, client, upload_planet, settings):
        upload_planet("One")
        upload_planet("Two")
        response = client.delete("/api/planets")
        assert response.status_code == 200
        assert response.json()["removed"] == 2
        assert client.get("/api/planets").json() == {"planets": []}
        assert list(settings.upload_dir.glob("*")) == []

    def test_upload_works_again_after_clear(self, client, upload_planet):
        upload_planet("Before")
        client.delete("/api/planets")
        after = upload_planet("After")
        assert client.get("/api/current-planet").json()["id"] == after["planet_id"]


class TestUploadServingSecurity:
    def test_path_traversal_is_blocked(self, client):
        assert client.get("/uploads/../../etc/passwd").status_code in (400, 404)
        assert client.get("/uploads/..%2f..%2fetc%2fpasswd").status_code in (400, 404)

    def test_missing_upload_is_404(self, client):
        assert client.get("/uploads/does-not-exist.png").status_code == 404
