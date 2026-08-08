"""
Application layer: use cases driven entirely through test doubles.

No filesystem, no Pillow, no FastAPI. This is the payoff of dependency
inversion - the orchestration logic (rate limit -> validate -> store ->
publish -> prune) is verified in isolation and runs in microseconds.
"""

import pytest

from app.application.use_cases import (
    DeletePlanetUseCase,
    GetCurrentPlanetUseCase,
    ListRecentPlanetsUseCase,
    SubmitPlanetUseCase,
)
from app.domain.errors import (
    ImageValidationError,
    NotFoundError,
    RateLimitedError,
)
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

    def recent(self, limit):
        if limit <= 0:
            return []
        return list(reversed(self.saved))[:limit]

    def delete(self, planet_id):
        for index, planet in enumerate(self.saved):
            if planet.id == planet_id:
                return self.saved.pop(index)
        return None

    def prune(self, keep):
        self.pruned_to = keep


class FakeEventPublisher:
    def __init__(self):
        self.published: list[dict] = []

    def publish(self, payload):
        self.published.append(payload)


class AllowAllRateLimiter:
    """Records calls so we can assert *when* the cooldown is consumed."""

    def __init__(self):
        self.checked: list[str] = []
        self.recorded: list[str] = []

    def check(self, key):
        self.checked.append(key)

    def record(self, key):
        self.recorded.append(key)


class DenyAllRateLimiter:
    def __init__(self):
        self.recorded: list[str] = []

    def check(self, key):
        raise RateLimitedError("Please wait a few seconds.")

    def record(self, key):
        self.recorded.append(key)


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

    def test_cooldown_is_consumed_only_after_a_successful_upload(self, deps):
        build(deps).execute(
            image_bytes=PNG_BYTES,
            content_type="image/png",
            raw_name="Good",
            client_key="10.0.0.1",
        )
        assert deps["rate_limiter"].checked == ["10.0.0.1"]
        assert deps["rate_limiter"].recorded == ["10.0.0.1"]

    def test_rejected_upload_does_not_consume_the_cooldown(self, deps):
        """
        A corrupt or oversized drawing must not make the child wait: nothing was
        stored, so the cooldown should not start.
        """
        with pytest.raises(ImageValidationError):
            build(deps).execute(
                image_bytes=b"not an image at all",
                content_type="image/png",
                raw_name="Bad",
                client_key="10.0.0.1",
            )
        assert deps["rate_limiter"].checked == ["10.0.0.1"]
        assert deps["rate_limiter"].recorded == []

    def test_processing_failure_does_not_consume_the_cooldown(self, deps):
        use_case = build(deps, image_processor=FakeImageProcessor(fail=True))
        with pytest.raises(ImageValidationError):
            use_case.execute(
                image_bytes=PNG_BYTES,
                content_type="image/png",
                raw_name="Corrupt",
                client_key="10.0.0.1",
            )
        assert deps["rate_limiter"].recorded == []

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


class TestListRecentPlanets:
    """
    Feeds the projector's gallery. Every drawing gets its own planet now, so
    the projector needs the whole set on load - not just the newest - or a
    refresh would empty the sky.
    """

    def test_returns_nothing_when_no_planet_has_been_drawn(self):
        result = ListRecentPlanetsUseCase(FakePlanetRepository()).execute(limit=12)
        assert result == {"planets": []}

    def test_returns_payloads_newest_first(self):
        repo = FakePlanetRepository()
        repo.save("id1", "First", b"x")
        repo.save("id2", "Second", b"x")

        result = ListRecentPlanetsUseCase(repo).execute(limit=12)

        assert [p["name"] for p in result["planets"]] == ["Second", "First"]
        assert all(p["has_planet"] is True for p in result["planets"])

    def test_uses_the_same_payload_shape_as_the_single_planet_endpoint(self):
        """One wire format, so the projector has one code path for both."""
        repo = FakePlanetRepository()
        planet = repo.save("id1", "Only", b"x")

        result = ListRecentPlanetsUseCase(repo).execute(limit=12)

        assert result["planets"] == [planet.to_payload()]

    def test_clamps_the_limit_to_the_configured_maximum(self):
        """A projector asking for 10000 must not be able to walk the whole store."""
        repo = FakePlanetRepository()
        for i in range(20):
            repo.save(f"id{i}", f"Planet {i}", b"x")

        result = ListRecentPlanetsUseCase(repo, max_limit=12).execute(limit=10_000)

        assert len(result["planets"]) == 12

    def test_a_non_positive_limit_yields_nothing(self):
        repo = FakePlanetRepository()
        repo.save("id1", "First", b"x")
        assert ListRecentPlanetsUseCase(repo).execute(limit=0) == {"planets": []}

    def test_default_limit_is_applied_when_none_is_requested(self):
        repo = FakePlanetRepository()
        for i in range(20):
            repo.save(f"id{i}", f"Planet {i}", b"x")

        result = ListRecentPlanetsUseCase(repo, max_limit=5).execute(limit=None)

        assert len(result["planets"]) == 5


class TestDeletePlanet:
    """
    A volunteer taking a drawing down mid-event. The use case owns two things
    the HTTP layer cannot: that nothing is announced when nothing was removed,
    and that the announcement rides the arrivals channel rather than a channel
    of its own.
    """

    def test_removes_the_planet_and_returns_it(self):
        repo = FakePlanetRepository()
        repo.save("keep1", "Keep", b"x")
        doomed = repo.save("drop1", "Drop", b"x")
        publisher = FakeEventPublisher()

        removed = DeletePlanetUseCase(repo, publisher).execute("drop1")

        assert removed == doomed
        assert [p.id for p in repo.saved] == ["keep1"]

    def test_announces_the_removal_on_the_arrivals_channel(self):
        """
        Same payload channel as a new planet, discriminated by `removed`. A
        dedicated event type would be dropped by any projector subscribed only
        to `planet`, and the drawing would stay on the wall after deletion -
        which is the failure this whole feature exists to prevent.
        """
        repo = FakePlanetRepository()
        repo.save("gone1", "Gone", b"x")
        publisher = FakeEventPublisher()

        DeletePlanetUseCase(repo, publisher).execute("gone1")

        assert publisher.published == [
            {"has_planet": False, "id": "gone1", "removed": True}
        ]

    def test_an_unknown_id_raises_rather_than_pretending_to_succeed(self):
        repo = FakePlanetRepository()
        repo.save("real1", "Real", b"x")
        publisher = FakeEventPublisher()

        with pytest.raises(NotFoundError):
            DeletePlanetUseCase(repo, publisher).execute("ghost")

        assert [p.id for p in repo.saved] == ["real1"]

    def test_a_failed_delete_announces_nothing(self):
        """
        Order matters: publish only after the store confirms. Announcing a
        removal that did not happen would clear the planet from every
        projector while the file is still on disk, and nothing would ever put
        it back.
        """
        repo = FakePlanetRepository()
        publisher = FakeEventPublisher()

        with pytest.raises(NotFoundError):
            DeletePlanetUseCase(repo, publisher).execute("never-existed")

        assert publisher.published == []

    def test_deleting_the_same_planet_twice_raises_the_second_time(self):
        repo = FakePlanetRepository()
        repo.save("once1", "Once", b"x")
        publisher = FakeEventPublisher()
        use_case = DeletePlanetUseCase(repo, publisher)

        use_case.execute("once1")

        with pytest.raises(NotFoundError):
            use_case.execute("once1")
        assert len(publisher.published) == 1

    def test_the_deleted_planet_leaves_the_gallery_listing(self):
        repo = FakePlanetRepository()
        repo.save("a", "Alpha", b"x")
        repo.save("b", "Beta", b"x")

        DeletePlanetUseCase(repo, FakeEventPublisher()).execute("a")

        listing = ListRecentPlanetsUseCase(repo).execute(limit=12)
        assert [p["name"] for p in listing["planets"]] == ["Beta"]
