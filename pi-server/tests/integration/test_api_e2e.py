"""
Integration / end-to-end tests.

These drive the real FastAPI application through TestClient:
  upload -> current-planet -> serve texture -> health / events.

They assert behaviour through the HTTP contract only, so the layered refactor
underneath is verified without coupling the tests to internal structure.
"""

import asyncio
import json
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.api.sse import build_planet_event_response
from app.application.use_cases import GetCurrentPlanetUseCase
from app.config import Settings
from app.factory import create_app


class TestHealth:
    def test_health_ok(self, client):
        r = client.get("/health")
        assert r.status_code == 200
        assert r.json() == {"status": "ok", "service": "kids-galaxy-projector"}


class TestGalaxyPage:
    def test_returns_404_when_static_missing(self, client):
        # The isolated test settings point at an empty static dir.
        assert client.get("/").status_code == 404

    def test_serves_index_when_present(self, tmp_path):
        static_dir = tmp_path / "static"
        static_dir.mkdir()
        (static_dir / "index.html").write_text("<h1>Galaxy</h1>", encoding="utf-8")
        from fastapi.testclient import TestClient

        app = create_app(
            Settings(upload_dir=tmp_path / "uploads", static_dir=static_dir)
        )
        r = TestClient(app).get("/")
        assert r.status_code == 200
        assert "Galaxy" in r.text


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

    def test_reject_content_type_mismatch(self, client):
        """Declared image/png but the bytes are not a PNG."""
        r = client.post(
            "/api/upload",
            files={"file": ("fake.png", b"totally not a png", "image/png")},
            data={"name": "Fake"},
        )
        assert r.status_code == 400

    def test_reject_oversized(self, client, app):
        big = b"\x89PNG\r\n\x1a\n" + b"x" * (app.state.settings.max_file_size + 1000)
        r = client.post(
            "/api/upload",
            files={"file": ("big.png", big, "image/png")},
            data={"name": "Huge"},
        )
        assert r.status_code == 400
        assert "too large" in r.json()["detail"].lower()


class TestRateLimiting:
    def test_second_upload_within_cooldown_is_throttled(self, tmp_path, make_png_bytes):
        from fastapi.testclient import TestClient

        app = create_app(
            Settings(
                upload_dir=tmp_path / "uploads",
                static_dir=tmp_path / "static",
                rate_limit_seconds=60.0,
            )
        )
        client = TestClient(app)
        png = make_png_bytes()

        first = client.post(
            "/api/upload",
            files={"file": ("p1.png", png, "image/png")},
            data={"name": "P1"},
        )
        assert first.status_code == 200

        second = client.post(
            "/api/upload",
            files={"file": ("p2.png", png, "image/png")},
            data={"name": "P2"},
        )
        assert second.status_code == 429

    def test_rejected_upload_does_not_start_the_cooldown(self, tmp_path, make_png_bytes):
        """
        A child whose drawing was rejected must be able to retry immediately -
        nothing was stored, so nothing should be throttled.
        """
        from fastapi.testclient import TestClient

        app = create_app(
            Settings(
                upload_dir=tmp_path / "uploads",
                static_dir=tmp_path / "static",
                rate_limit_seconds=60.0,
            )
        )
        client = TestClient(app)

        rejected = client.post(
            "/api/upload",
            files={"file": ("bad.png", b"not a real image", "image/png")},
            data={"name": "Broken"},
        )
        assert rejected.status_code == 400

        # Immediately afterwards, a valid drawing must still be accepted.
        accepted = client.post(
            "/api/upload",
            files={"file": ("good.png", make_png_bytes(), "image/png")},
            data={"name": "Second Try"},
        )
        assert accepted.status_code == 200, accepted.text
        assert accepted.json()["name"] == "Second Try"


class TestServeUploadSecurity:
    def test_path_traversal_blocked(self, client):
        r = client.get("/uploads/../../etc/passwd")
        assert r.status_code in (400, 404)

    def test_encoded_path_traversal_blocked(self, client):
        r = client.get("/uploads/..%2f..%2fetc%2fpasswd")
        assert r.status_code in (400, 404)

    def test_missing_planet_404(self, client):
        assert client.get("/uploads/does-not-exist-xyz.png").status_code == 404


class TestEndToEndPlanetFlow:
    """upload -> current-planet -> fetch texture."""

    def test_png_upload_then_visible_in_galaxy(self, client, make_png_bytes):
        png = make_png_bytes(color=(30, 144, 255))

        upload = client.post(
            "/api/upload",
            files={"file": ("kid_planet.png", png, "image/png")},
            data={"name": "Kid Blue Planet"},
        )
        assert upload.status_code == 200, upload.text
        body = upload.json()
        assert body["status"] == "success"
        assert body["name"] == "Kid Blue Planet"
        assert body["planet_id"]
        assert body["url"].startswith("/uploads/") and body["url"].endswith(".png")

        current = client.get("/api/current-planet").json()
        assert current["has_planet"] is True
        assert current["url"] == body["url"]
        assert current["name"] == "Kid Blue Planet"

        texture = client.get(body["url"])
        assert texture.status_code == 200
        assert texture.headers.get("content-type", "").startswith("image/")
        assert len(texture.content) > 50

    def test_jpeg_upload_is_stored_as_png(self, client, make_jpeg_bytes):
        upload = client.post(
            "/api/upload",
            files={"file": ("planet.jpg", make_jpeg_bytes(), "image/jpeg")},
            data={"name": "Orange World"},
        )
        assert upload.status_code == 200
        body = upload.json()
        # Everything is normalised to PNG on the way in.
        assert body["url"].endswith(".png")
        assert client.get(body["url"]).status_code == 200

    def test_no_planet_before_any_upload(self, client):
        assert client.get("/api/current-planet").json() == {"has_planet": False}


class TestDisplayName:
    """
    The projector must show exactly what the child typed - never the internal
    id, never a name mangled by filesystem sanitization.
    """

    def test_name_has_no_uuid_prefix(self, client, upload_planet):
        body = upload_planet("My Planet")
        current = client.get("/api/current-planet").json()
        assert current["name"] == "My Planet"
        assert body["planet_id"] not in current["name"]

    def test_unicode_and_punctuation_survive(self, client, upload_planet):
        typed = "Alice's World!"
        body = upload_planet(typed)
        assert body["name"] == typed
        assert client.get("/api/current-planet").json()["name"] == typed

    def test_blank_name_falls_back_to_default(self, upload_planet):
        assert upload_planet("   ")["name"] == "My Planet"

    def test_traversal_attempt_in_name_is_neutralised(self, client, upload_planet):
        body = upload_planet("../../etc/passwd")
        assert "/" not in body["url"].removeprefix("/uploads/")
        assert client.get(body["url"]).status_code == 200


class TestRetention:
    def test_only_the_newest_planets_are_kept(self, tmp_path, make_png_bytes):
        from fastapi.testclient import TestClient

        settings = Settings(
            upload_dir=tmp_path / "uploads",
            static_dir=tmp_path / "static",
            rate_limit_seconds=0.0,
            max_stored_planets=3,
        )
        client = TestClient(create_app(settings))

        for i in range(6):
            r = client.post(
                "/api/upload",
                files={"file": ("p.png", make_png_bytes(), "image/png")},
                data={"name": f"Planet {i}"},
            )
            assert r.status_code == 200

        images = list(settings.upload_dir.glob("*.png"))
        sidecars = list(settings.upload_dir.glob("*.json"))
        assert len(images) == 3
        assert len(sidecars) == 3  # no orphaned metadata

        # The most recent upload is still the one on screen.
        assert client.get("/api/current-planet").json()["name"] == "Planet 5"


def _parse_sse(chunk: str) -> dict:
    for line in chunk.splitlines():
        if line.startswith("data:"):
            return json.loads(line[len("data:") :].strip())
    raise AssertionError(f"No data line in SSE frame: {chunk!r}")


@pytest.mark.asyncio
class TestEventStream:
    """
    Server-Sent Events. The response generator is driven directly rather than
    through TestClient: the stream is infinite, which deadlocks a blocking
    client. The HTTP wiring itself is covered by test_events_endpoint_headers.
    """

    async def _open(self, app):
        """
        Drive the stream directly. Introspecting app.routes proved brittle
        across Starlette versions, and a blocking client would deadlock on an
        endless response.
        """
        request = MagicMock()
        request.is_disconnected = AsyncMock(return_value=False)
        response = build_planet_event_response(
            request,
            app.state.publisher,
            GetCurrentPlanetUseCase(app.state.repository),
        )
        return response.body_iterator

    async def test_stream_primes_new_clients(self, app, client, upload_planet):
        upload_planet("Streamed World")

        stream = await self._open(app)
        try:
            first = await asyncio.wait_for(stream.__anext__(), timeout=5)
        finally:
            await stream.aclose()

        payload = _parse_sse(first)
        assert payload["has_planet"] is True
        assert payload["name"] == "Streamed World"

    async def test_upload_is_pushed_to_a_connected_client(self, app, publisher):
        stream = await self._open(app)
        try:
            await asyncio.wait_for(stream.__anext__(), timeout=5)  # priming frame

            publisher.publish(
                {
                    "has_planet": True,
                    "url": "/uploads/pushed.png",
                    "name": "Pushed World",
                    "timestamp": 1234.0,
                }
            )
            pushed = await asyncio.wait_for(stream.__anext__(), timeout=5)
        finally:
            await stream.aclose()

        payload = _parse_sse(pushed)
        assert payload["name"] == "Pushed World"

    async def test_subscriber_is_released_on_disconnect(self, app, publisher):
        assert publisher.subscriber_count == 0
        stream = await self._open(app)
        await asyncio.wait_for(stream.__anext__(), timeout=5)
        assert publisher.subscriber_count == 1

        await stream.aclose()
        assert publisher.subscriber_count == 0


@pytest.mark.asyncio
class TestEventsEndpointHeaders:
    async def test_sse_response_headers(self, app):
        """
        Inspect the response object without consuming its body - streaming an
        endless response through a blocking test client would deadlock.
        """
        request = MagicMock()
        request.is_disconnected = AsyncMock(return_value=True)
        response = build_planet_event_response(
            request,
            app.state.publisher,
            GetCurrentPlanetUseCase(app.state.repository),
        )

        assert response.media_type == "text/event-stream"
        assert response.headers["cache-control"] == "no-cache"
        # Disables proxy buffering, which would otherwise delay every event.
        assert response.headers["x-accel-buffering"] == "no"
        await response.body_iterator.aclose()


class TestRoutesAreRegistered:
    """
    The SSE tests above bypass routing to avoid deadlocking on an endless
    response, so assert separately that every endpoint is actually wired up.
    Read from the OpenAPI schema rather than app.routes: route objects do not
    expose `path` consistently across Starlette versions.
    """

    def test_all_endpoints_are_exposed(self, client):
        paths = client.get("/openapi.json").json()["paths"]
        for expected in (
            "/",
            "/health",
            "/api/current-planet",
            "/api/upload",
            "/api/events",
            "/uploads/{filename}",
        ):
            assert expected in paths, f"{expected} is not registered"
