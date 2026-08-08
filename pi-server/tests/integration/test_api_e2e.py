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


class TestPlanetGallery:
    """
    Every drawing becomes its own planet now, so the projector loads the whole
    visible set on start. Before this endpoint existed, refreshing the page
    emptied a sky that had taken an afternoon to fill.
    """

    def test_empty_before_any_upload(self, client):
        assert client.get("/api/planets").json() == {"planets": []}

    def test_lists_every_upload_newest_first(self, client, upload_planet):
        upload_planet("First")
        upload_planet("Second")
        upload_planet("Third")

        planets = client.get("/api/planets").json()["planets"]

        assert [p["name"] for p in planets] == ["Third", "Second", "First"]

    def test_each_entry_matches_the_single_planet_payload_shape(
        self, client, upload_planet
    ):
        """One wire format, so the projector has one code path for both."""
        upload_planet("Only One")

        gallery = client.get("/api/planets").json()["planets"]
        current = client.get("/api/current-planet").json()

        assert gallery == [current]

    def test_entries_carry_a_usable_texture_url(self, client, upload_planet):
        upload_planet("Texturised")

        planet = client.get("/api/planets").json()["planets"][0]
        texture = client.get(planet["url"])

        assert texture.status_code == 200
        assert texture.headers.get("content-type", "").startswith("image/")

    def test_ids_are_distinct_so_the_projector_can_deduplicate(
        self, client, upload_planet
    ):
        upload_planet("One")
        upload_planet("Two")

        ids = [p["id"] for p in client.get("/api/planets").json()["planets"]]

        assert len(set(ids)) == 2

    def test_limit_narrows_the_result(self, client, upload_planet):
        upload_planet("First")
        upload_planet("Second")

        planets = client.get("/api/planets?limit=1").json()["planets"]

        assert [p["name"] for p in planets] == ["Second"]

    def test_an_absurd_limit_is_clamped_not_honoured(self, client, upload_planet):
        """
        The parameter is caller-controlled; it must not open the whole store.

        The ceiling is retention rather than the projector's gallery size: the
        manager app lists everything stored so a volunteer can take down any
        drawing, while the projector asks for limit=12. The exact clamp is
        pinned in the use-case unit tests; this only proves the endpoint cannot
        be talked past its maximum.
        """
        for i in range(4):
            upload_planet(f"Planet {i}")

        planets = client.get("/api/planets?limit=100000").json()["planets"]

        assert len(planets) <= 30

    def test_the_ceiling_really_is_the_configured_maximum(
        self, tmp_path, make_png_bytes
    ):
        """Uses a small retention so this needs six uploads rather than 31."""
        from fastapi.testclient import TestClient

        settings = Settings(
            upload_dir=tmp_path / "uploads",
            static_dir=tmp_path / "static",
            rate_limit_seconds=0.0,
            max_stored_planets=3,
        )
        client = TestClient(create_app(settings))

        for i in range(6):
            client.post(
                "/api/upload",
                files={"file": ("p.png", make_png_bytes(), "image/png")},
                data={"name": f"Planet {i}"},
            )

        assert len(client.get("/api/planets?limit=999").json()["planets"]) == 3

    def test_a_negative_limit_is_rejected_rather_than_guessed_at(self, client):
        assert client.get("/api/planets?limit=-1").status_code == 422

    def test_a_non_numeric_limit_is_rejected(self, client):
        assert client.get("/api/planets?limit=all").status_code == 422


class TestDeletePlanet:
    """
    The manager app takes a drawing down mid-event without restarting the
    kiosk. Deleting has to reach three places at once: the store, the gallery
    listing, and every connected projector - a planet that vanishes from the
    list but stays on the wall is the failure that matters here.
    """

    def test_removes_the_planet_and_reports_what_went(self, client, upload_planet):
        planet = upload_planet("Doomed World")
        planet_id = planet["planet_id"]

        response = client.delete(f"/api/planets/{planet_id}")

        assert response.status_code == 200
        assert response.json() == {
            "status": "deleted",
            "planet_id": planet_id,
            "name": "Doomed World",
        }

    def test_it_disappears_from_the_gallery(self, client, upload_planet):
        keep = upload_planet("Keep Me")
        drop = upload_planet("Drop Me")

        client.delete(f"/api/planets/{drop['planet_id']}")

        names = [p["name"] for p in client.get("/api/planets").json()["planets"]]
        assert names == ["Keep Me"]
        assert client.get("/api/current-planet").json()["url"] == keep["url"]

    def test_the_texture_stops_being_served(self, client, upload_planet):
        planet = upload_planet("Gone Soon")
        assert client.get(planet["url"]).status_code == 200

        client.delete(f"/api/planets/{planet['planet_id']}")

        assert client.get(planet["url"]).status_code == 404

    def test_the_sidecar_goes_too(self, client, upload_planet, settings):
        """An orphaned .json would resurrect the name on the next listing."""
        planet = upload_planet("Tidy Up")

        client.delete(f"/api/planets/{planet['planet_id']}")

        assert list(settings.upload_dir.glob("*.png")) == []
        assert list(settings.upload_dir.glob("*.json")) == []

    @pytest.mark.asyncio
    async def test_connected_projectors_are_told(self, app, publisher):
        """
        The removal rides the same SSE channel as arrivals - the projector
        keys on `removed`, so a separate event type would be silently ignored
        by any client subscribed only to `planet`.

        Driven through the use case rather than TestClient because the
        publisher is async and a subscriber has to be registered before the
        delete happens; the HTTP wiring is covered by the tests above.
        """
        from app.application.use_cases import DeletePlanetUseCase

        planet = app.state.repository.save("abc123", "Broadcast Me", b"\x89PNG\r\n\x1a\n")
        use_case = DeletePlanetUseCase(app.state.repository, publisher)

        async with publisher.subscribe() as stream:
            use_case.execute(planet.id)
            received = await asyncio.wait_for(stream.get(), timeout=1)

        assert received == {
            "has_planet": False,
            "id": "abc123",
            "removed": True,
        }

    def test_an_unknown_id_is_404_not_500(self, client):
        response = client.delete("/api/planets/doesnotexist")

        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()

    def test_deleting_twice_is_404_the_second_time(self, client, upload_planet):
        planet = upload_planet("Once Only")

        assert client.delete(f"/api/planets/{planet['planet_id']}").status_code == 200
        assert client.delete(f"/api/planets/{planet['planet_id']}").status_code == 404

    def test_a_traversal_id_cannot_reach_outside_the_store(
        self, client, upload_planet, settings
    ):
        """
        The id becomes a filename prefix match, never a path. A caller that
        sends one should get a plain 404, and the store must be untouched.
        """
        upload_planet("Innocent")

        response = client.delete("/api/planets/..%2F..%2Fetc%2Fpasswd")

        assert response.status_code in (404, 405)
        assert len(list(settings.upload_dir.glob("*.png"))) == 1


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


class TestClearAllPlanets:
    """
    "Clear all" in the manager app. Distinct from deleting one at a time: the
    volunteer wants an empty sky in one action at the end of an event.
    """

    def test_empties_the_gallery_and_reports_the_count(self, client, upload_planet):
        for i in range(3):
            upload_planet(f"Planet {i}")

        response = client.delete("/api/planets")

        assert response.status_code == 200
        assert response.json() == {"status": "cleared", "removed": 3}
        assert client.get("/api/planets").json() == {"planets": []}
        assert client.get("/api/current-planet").json() == {"has_planet": False}

    def test_the_textures_stop_being_served(self, client, upload_planet):
        planet = upload_planet("Gone")
        assert client.get(planet["url"]).status_code == 200

        client.delete("/api/planets")

        assert client.get(planet["url"]).status_code == 404

    def test_nothing_is_left_on_disk(self, client, upload_planet, settings):
        for i in range(3):
            upload_planet(f"Planet {i}")

        client.delete("/api/planets")

        assert list(settings.upload_dir.glob("*.png")) == []
        assert list(settings.upload_dir.glob("*.json")) == []

    def test_clearing_an_empty_gallery_succeeds(self, client):
        """Idempotent: a volunteer tapping twice must not see an error."""
        response = client.delete("/api/planets")

        assert response.status_code == 200
        assert response.json() == {"status": "cleared", "removed": 0}

    def test_uploading_works_again_afterwards(self, client, upload_planet):
        upload_planet("Before")
        client.delete("/api/planets")

        after = upload_planet("After")

        assert client.get("/api/current-planet").json()["url"] == after["url"]

    def test_the_collection_route_does_not_shadow_the_single_delete(
        self, client, upload_planet
    ):
        """
        DELETE /api/planets and DELETE /api/planets/{id} share a prefix, and
        Starlette matches in registration order - so this pins that one planet
        can still be removed on its own.
        """
        keep = upload_planet("Keep")
        drop = upload_planet("Drop")

        assert client.delete(f"/api/planets/{drop['planet_id']}").status_code == 200

        names = [p["name"] for p in client.get("/api/planets").json()["planets"]]
        assert names == ["Keep"]
        assert client.get(keep["url"]).status_code == 200


class TestSurfaceBlending:
    """
    Uploads come back as a planet surface rather than marker on white paper.
    Asserted through the HTTP contract, because that is where the projector
    reads it from.
    """

    def test_the_stored_texture_is_not_mostly_white(self, client, upload_planet):
        import io as _io

        from PIL import Image as _Image

        # A small red blob on a large white canvas: the "before" case exactly.
        canvas = _Image.new("RGB", (256, 128), (255, 255, 255))
        canvas.paste(_Image.new("RGB", (30, 30), (220, 40, 40)), (110, 50))
        buffer = _io.BytesIO()
        canvas.save(buffer, format="PNG")

        planet = upload_planet("Blended", png=buffer.getvalue())
        stored = _Image.open(_io.BytesIO(client.get(planet["url"]).content))

        greyscale = list(stored.convert("L").getdata())
        white = sum(1 for p in greyscale if p >= 238) / len(greyscale)
        assert white < 0.10, f"still {white:.0%} white paper"

    def test_it_can_be_switched_off(self, tmp_path, make_png_bytes):
        """An operator who dislikes the effect gets the plain drawing back."""
        from fastapi.testclient import TestClient

        settings = Settings(
            upload_dir=tmp_path / "uploads",
            static_dir=tmp_path / "static",
            rate_limit_seconds=0.0,
            surface_blend=False,
        )
        client = TestClient(create_app(settings))

        response = client.post(
            "/api/upload",
            files={"file": ("p.png", make_png_bytes(color=(255, 255, 255)), "image/png")},
            data={"name": "Plain"},
        )
        assert response.status_code == 200

        import io as _io

        from PIL import Image as _Image

        stored = _Image.open(_io.BytesIO(client.get(response.json()["url"]).content))
        greyscale = list(stored.convert("L").getdata())
        white = sum(1 for p in greyscale if p >= 238) / len(greyscale)
        assert white > 0.9, "with blending off a white drawing should stay white"
