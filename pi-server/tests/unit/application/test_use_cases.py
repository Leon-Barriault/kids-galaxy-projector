"""
Application layer: use cases driven entirely through test doubles.

No filesystem, no Pillow, no FastAPI. This is the payoff of dependency
inversion - the orchestration logic (rate limit -> validate -> store ->
publish -> prune) is verified in isolation and runs in microseconds.
"""

import pytest

from app.application.use_cases import GetCurrentPlanetUseCase, SubmitPlanetUseCase
from app.domain.errors import ImageValidationError, RateLimitedError
from app.domain.planet import NO_PLANET_PAYLOAD, Planet

PNG_BYTES = b"\x89PNG\r\n\x1a\n valid-enough-for-the-fake"


class FakePlanetRepository:
    def __init__(self):
        self.saved: list[Planet] = []
        self.pruned_to: int | None = None

    def save(self, planet_id, display_name, image_bytes):
        planet = Planet(
            id=planet_id,
            filename=f"{planet_id}_{display_name}.png",
            display_name=display_name,
            created_at=float(len(self.saved)),
        )
        self.saved.append(planet)
        return planet

    def latest(self):
        return self.saved[-1] if self.saved else None

    def prune(self, keep):
        self.pruned_to = keep


class FakeEventPublisher:
    def __init__(self):
        self.published: list[dict] = []

    def publish(self, payload):
        self.published.append(payload)


class AllowAllRateLimiter:
    def check(self, key):
        return None


class DenyAllRateLimiter:
    def check(self, key):
        raise RateLimitedError("Please wait a few seconds.")


class FakeImageProcessor:
    """Stands in for Pillow: records calls, returns normalised bytes."""

    def __init__(self, fail=False):
        self.fail = fail
        self.calls = 0

    def normalize_to_png(self, content, max_dimension, target_size):
        self.calls += 1
        if self.fail:
            raise ImageValidationError("Invalid or corrupted image.")
        return b"normalised-png"


@pytest.fixture
def deps():
    return {
        "repository": FakePlanetRepository(),
        "publisher": FakeEventPublisher(),
        "rate_limiter": AllowAllRateLimiter(),
        "image_processor": FakeImageProcessor(),
    }


def build(deps, **overrides):
    return SubmitPlanetUseCase(**{**deps, **overrides})


class TestSubmitPlanet:
    def test_stores_the_planet(self, deps):
        result = build(deps).execute(
            image_bytes=PNG_BYTES,
            content_type="image/png",
            raw_name="Sparkle World",
            client_key="10.0.0.1",
        )
        assert len(deps["repository"].saved) == 1
        assert result.display_name == "Sparkle World"

    def test_publishes_so_the_projector_updates_without_polling(self, deps):
        build(deps).execute(
            image_bytes=PNG_BYTES,
            content_type="image/png",
            raw_name="Pushed World",
            client_key="10.0.0.1",
        )
        assert len(deps["publisher"].published) == 1
        assert deps["publisher"].published[0]["name"] == "Pushed World"
        assert deps["publisher"].published[0]["has_planet"] is True

    def test_prunes_after_storing(self, deps):
        build(deps).execute(
            image_bytes=PNG_BYTES,
            content_type="image/png",
            raw_name="X",
            client_key="10.0.0.1",
        )
        assert deps["repository"].pruned_to is not None

    def test_blank_name_gets_the_default(self, deps):
        result = build(deps).execute(
            image_bytes=PNG_BYTES,
            content_type="image/png",
            raw_name="   ",
            client_key="10.0.0.1",
        )
        assert result.display_name == "My Planet"

    def test_rate_limited_request_is_rejected_before_any_work(self, deps):
        use_case = build(deps, rate_limiter=DenyAllRateLimiter())
        with pytest.raises(RateLimitedError):
            use_case.execute(
                image_bytes=PNG_BYTES,
                content_type="image/png",
                raw_name="Blocked",
                client_key="10.0.0.1",
            )
        # Nothing stored, nothing published, no image work done.
        assert deps["repository"].saved == []
        assert deps["publisher"].published == []
        assert deps["image_processor"].calls == 0

    def test_bad_content_type_is_rejected(self, deps):
        with pytest.raises(ImageValidationError):
            build(deps).execute(
                image_bytes=PNG_BYTES,
                content_type="text/plain",
                raw_name="Bad",
                client_key="10.0.0.1",
            )
        assert deps["repository"].saved == []

    def test_content_not_matching_magic_bytes_is_rejected(self, deps):
        with pytest.raises(ImageValidationError):
            build(deps).execute(
                image_bytes=b"totally not an image",
                content_type="image/png",
                raw_name="Bad",
                client_key="10.0.0.1",
            )
        assert deps["repository"].saved == []

    def test_empty_upload_is_rejected(self, deps):
        with pytest.raises(ImageValidationError):
            build(deps).execute(
                image_bytes=b"",
                content_type="image/png",
                raw_name="Empty",
                client_key="10.0.0.1",
            )

    def test_oversized_upload_is_rejected(self, deps):
        use_case = build(deps)
        with pytest.raises(ImageValidationError):
            use_case.execute(
                image_bytes=b"\x89PNG\r\n\x1a\n" + b"x" * 10_000,
                content_type="image/png",
                raw_name="Huge",
                client_key="10.0.0.1",
                max_size=100,
            )
        assert deps["repository"].saved == []

    def test_processing_failure_does_not_publish(self, deps):
        use_case = build(deps, image_processor=FakeImageProcessor(fail=True))
        with pytest.raises(ImageValidationError):
            use_case.execute(
                image_bytes=PNG_BYTES,
                content_type="image/png",
                raw_name="Corrupt",
                client_key="10.0.0.1",
            )
        assert deps["publisher"].published == []

    def test_stores_the_normalised_bytes_not_the_raw_upload(self, deps):
        """Re-encoding is what strips hostile metadata, so it must be what we save."""
        captured = {}

        class CapturingRepo(FakePlanetRepository):
            def save(self, planet_id, display_name, image_bytes):
                captured["bytes"] = image_bytes
                return super().save(planet_id, display_name, image_bytes)

        use_case = build(deps, repository=CapturingRepo())
        use_case.execute(
            image_bytes=PNG_BYTES,
            content_type="image/png",
            raw_name="Clean",
            client_key="10.0.0.1",
        )
        assert captured["bytes"] == b"normalised-png"


class TestGetCurrentPlanet:
    def test_returns_no_planet_when_empty(self):
        repo = FakePlanetRepository()
        assert GetCurrentPlanetUseCase(repo).execute() == NO_PLANET_PAYLOAD

    def test_returns_latest_planet_payload(self):
        repo = FakePlanetRepository()
        repo.save("id1", "First", b"x")
        repo.save("id2", "Second", b"x")
        payload = GetCurrentPlanetUseCase(repo).execute()
        assert payload["has_planet"] is True
        assert payload["name"] == "Second"
