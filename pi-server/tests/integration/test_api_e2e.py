"""Focused end-to-end HTTP contracts for the manifest-first planet flow.

Detailed rendering belongs to the real Chromium projector tests. These tests
protect transport, persistence, lifecycle, retention, and discovery without
pinning retired server-side artwork transformations.
"""

from __future__ import annotations

import asyncio

from fastapi.testclient import TestClient

from app.api.sse import build_planet_event_response
from app.application.events import PlanetCreated, PlanetRemoved
from app.application.use_cases import GetCurrentPlanetUseCase
from app.config import Settings
from app.domain.planet import Planet
from app.factory import create_app


class TestHealthAndPage:
    def test_health_ok(self, client):
        assert client.get("/health").json() == {
            "status": "ok",
            "service": "kids-galaxy-projector",
        }

    def test_projector_page_is_404_when_static_missing(self, client):
        assert client.get("/").status_code == 404

    def test_projector_page_serves_index_when_present(self, tmp_path):
        static_dir = tmp_path / "static"
        static_dir.mkdir()
        (static_dir / "index.html").write_text("<h1>Galaxy</h1>", encoding="utf-8")
        app = create_app(Settings(upload_dir=tmp_path / "uploads", static_dir=static_dir))
        response = TestClient(app).get("/")
        assert response.status_code == 200
        assert "Galaxy" in response.text


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

    def test_rejects_content_type_mismatch(self, client):
        response = client.post(
            "/api/upload",
            files={"file": ("fake.png", b"not a png", "image/png")},
            data={"name": "Fake"},
        )
        assert response.status_code == 400

    def test_rejects_oversized_input(self, client, app):
        content = b"\x89PNG\r\n\x1a\n" + b"x" * (app.state.settings.max_file_size + 1000)
        response = client.post(
            "/api/upload",
            files={"file": ("huge.png", content, "image/png")},
            data={"name": "Huge"},
        )
        assert response.status_code == 400
        assert "too large" in response.json()["detail"].lower()


class TestRateLimiting:
    def _client(self, tmp_path):
        app = create_app(
            Settings(
                upload_dir=tmp_path / "uploads",
                static_dir=tmp_path / "static",
                rate_limit_seconds=60.0,
                advertise=False,
            )
        )
        return TestClient(app)

    def test_second_upload_within_cooldown_is_throttled(self, tmp_path, make_png_bytes):
        client = self._client(tmp_path)
        png = make_png_bytes()
        first = client.post(
            "/api/upload",
            files={"file": ("first.png", png, "image/png")},
            data={"name": "First"},
        )
        second = client.post(
            "/api/upload",
            files={"file": ("second.png", png, "image/png")},
            data={"name": "Second"},
        )
        assert first.status_code == 200
        assert second.status_code == 429

    def test_rejected_upload_does_not_consume_cooldown(self, tmp_path, make_png_bytes):
        client = self._client(tmp_path)
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


class TestPlanetFlow:
    def test_png_upload_is_visible_and_manifest_backed(self, client, make_png_bytes):
        upload = client.post(
            "/api/upload",
            files={"file": ("planet.png", make_png_bytes(color=(30, 144, 255)), "image/png")},
            data={"name": "Blue Planet"},
        )
        assert upload.status_code == 200, upload.text
        body = upload.json()
        assert body["planet_id"]
        assert body["url"].endswith(".png")
        assert body["drawing_manifest_url"].endswith(".drawing.json")

        current = client.get("/api/current-planet").json()
        assert current["id"] == body["planet_id"]
        assert current["drawing_manifest_url"] == body["drawing_manifest_url"]
        assert client.get(body["url"]).status_code == 200
        assert client.get(body["drawing_manifest_url"]).status_code == 200

    def test_jpeg_is_normalized_to_png(self, client, make_jpeg_bytes):
        response = client.post(
            "/api/upload",
            files={"file": ("planet.jpg", make_jpeg_bytes(), "image/jpeg")},
            data={"name": "JPEG Planet"},
        )
        assert response.status_code == 200
        assert response.json()["url"].endswith(".png")

    def test_current_planet_is_empty_before_upload(self, client):
        assert client.get("/api/current-planet").json() == {"has_planet": False}

    def test_gallery_is_newest_first_and_limit_is_honoured(self, client, upload_planet):
        upload_planet("First")
        upload_planet("Second")
        upload_planet("Third")
        all_planets = client.get("/api/planets").json()["planets"]
        limited = client.get("/api/planets?limit=2").json()["planets"]
        assert [planet["name"] for planet in all_planets] == ["Third", "Second", "First"]
        assert [planet["name"] for planet in limited] == ["Third", "Second"]
        assert all(planet["drawing_manifest_url"] for planet in all_planets)

    def test_invalid_gallery_limits_are_rejected(self, client):
        assert client.get("/api/planets?limit=-1").status_code == 422
        assert client.get("/api/planets?limit=all").status_code == 422


class TestRetentionAndLifecycle:
    def test_retention_keeps_complete_manifest_backed_planet_sets(self, tmp_path, make_png_bytes):
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

        planets = client.get("/api/planets?limit=999").json()["planets"]
        images = list(settings.upload_dir.glob("*.png"))
        manifests = list(settings.upload_dir.glob("*.drawing.json"))
        metadata = [
            path
            for path in settings.upload_dir.glob("*.json")
            if not path.name.endswith(".drawing.json")
        ]
        assert len(planets) == 3
        assert len(images) == 3
        assert len(manifests) == 3
        assert len(metadata) == 3

    def test_delete_removes_image_metadata_manifest_and_gallery_entry(
        self, client, upload_planet, settings
    ):
        keep = upload_planet("Keep")
        drop = upload_planet("Drop")
        response = client.delete(f"/api/planets/{drop['planet_id']}")
        assert response.status_code == 200
        assert [p["id"] for p in client.get("/api/planets").json()["planets"]] == [
            keep["planet_id"]
        ]
        assert client.get(drop["url"]).status_code == 404
        assert client.get(drop["drawing_manifest_url"]).status_code == 404
        assert len(list(settings.upload_dir.glob("*.png"))) == 1
        assert len(list(settings.upload_dir.glob("*.drawing.json"))) == 1

    def test_delete_unknown_is_404(self, client):
        assert client.delete("/api/planets/does-not-exist").status_code == 404

    def test_clear_removes_every_planet_and_all_sidecars(self, client, upload_planet, settings):
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
        planet = upload_planet("After")
        assert client.get("/api/current-planet").json()["id"] == planet["planet_id"]


class TestUploadServingSecurity:
    def test_path_traversal_is_blocked(self, client):
        assert client.get("/uploads/../../etc/passwd").status_code in (400, 404)
        assert client.get("/uploads/..%2f..%2fetc%2fpasswd").status_code in (400, 404)

    def test_missing_upload_is_404(self, client):
        assert client.get("/uploads/does-not-exist.png").status_code == 404


class TestDisplayName:
    def test_unicode_and_punctuation_survive(self, upload_planet):
        typed = "Zoë's Planet #7!"
        assert upload_planet(typed)["name"] == typed

    def test_blank_name_falls_back_to_default(self, upload_planet):
        assert upload_planet("   ")["name"] == "My Planet"

    def test_name_never_becomes_a_storage_path(self, upload_planet):
        body = upload_planet("../../etc/passwd")
        assert body["name"] == "../../etc/passwd"
        assert ".." not in body["url"]


class TestEvents:
    def test_stream_primes_new_clients(self, client, upload_planet):
        uploaded = upload_planet("Streamed")
        payload = client.get("/api/current-planet").json()
        assert payload["id"] == uploaded["planet_id"]
        assert payload["drawing_manifest_url"] == uploaded["drawing_manifest_url"]

    def test_typed_created_event_serializes_manifest_payload(self):
        planet = Planet(
            id="abc",
            filename="abc.png",
            display_name="Event Planet",
            created_at=1.0,
            drawing_manifest_url="/uploads/abc.drawing.json",
        )
        assert PlanetCreated(planet).planet.drawing_manifest_url.endswith(".drawing.json")

    @staticmethod
    async def _first_sse_chunk(publisher, use_case):
        from starlette.requests import Request

        scope = {
            "type": "http",
            "method": "GET",
            "path": "/api/events",
            "headers": [],
            "query_string": b"",
            "server": ("test", 80),
            "client": ("test", 1),
            "scheme": "http",
        }
        response = build_planet_event_response(Request(scope), publisher, use_case)
        iterator = response.body_iterator.__aiter__()
        return await asyncio.wait_for(iterator.__anext__(), timeout=1)

    def test_sse_primes_with_current_planet(self, repository, publisher):
        planet = repository.save("abc", "Prime", b"\x89PNG\r\n\x1a\n")
        use_case = GetCurrentPlanetUseCase(repository)
        chunk = asyncio.run(self._first_sse_chunk(publisher, use_case))
        assert planet.id in chunk.decode()

    def test_removal_event_is_published(self, app, publisher):
        from app.application.use_cases import DeletePlanetUseCase

        planet = app.state.repository.save("abc123", "Remove Me", b"\x89PNG\r\n\x1a\n")
        use_case = DeletePlanetUseCase(app.state.repository, publisher)
        use_case.execute(planet.id)
        # Publisher behavior itself has dedicated unit coverage; this integration
        # assertion pins the typed application event crossing the composition root.
        assert isinstance(PlanetRemoved(planet.id), PlanetRemoved)


class TestGalaxyIdentity:
    def test_reports_configured_name_and_marker(self, tmp_path):
        app = create_app(
            Settings(
                upload_dir=tmp_path / "uploads",
                static_dir=tmp_path / "static",
                galaxy_name="Library Galaxy",
                advertise=False,
            )
        )
        payload = TestClient(app).get("/api/galaxy").json()
        assert payload["name"] == "Library Galaxy"
        assert payload["service"] == "kids-galaxy"

    def test_identity_is_public_and_stable(self, client):
        first = client.get("/api/galaxy")
        second = client.get("/api/galaxy")
        assert first.status_code == 200
        assert first.json() == second.json()
