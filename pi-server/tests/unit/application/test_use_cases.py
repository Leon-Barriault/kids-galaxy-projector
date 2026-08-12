"""Unit tests for application orchestration in the manifest-first architecture."""

from __future__ import annotations

import json
from contextlib import asynccontextmanager
from pathlib import Path
from unittest.mock import Mock

import pytest

from app.application.events import GalaxyCleared, PlanetCreated, PlanetRemoved
from app.application.use_cases import (
    ClearPlanetsUseCase,
    DeletePlanetUseCase,
    GetCurrentPlanetUseCase,
    GetPlanetByIdUseCase,
    ListRecentPlanetsUseCase,
    SubmitPlanetUseCase,
)
from app.domain.errors import NotFoundError, ValidationError
from app.domain.planet import NO_PLANET_PAYLOAD, Planet
from app.ports import EventPublisher, ImageProcessor, PlanetRepository, RateLimiter

PNG = b"\x89PNG\r\n\x1a\n" + b"kid drawing"
NORMALIZED = b"\x89PNG\r\n\x1a\n" + b"normalized"


def manifest_bytes(background: str = "#ffffff") -> bytes:
    return json.dumps(
        {
            "version": 1,
            "coordinate_space": "normalized-canvas-v1",
            "canvas": {"width": 512, "height": 512},
            "background_color": background,
            "background_explicit": True,
            "strokes": [
                {
                    "order": 0,
                    "color": "#7b1fa2",
                    "width_px": 32,
                    "width_normalized": 0.0625,
                    "points": [[0.1, 0.12], [0.5, 0.15], [0.9, 0.13]],
                },
                {
                    "order": 1,
                    "color": "#43a047",
                    "width_px": 24,
                    "width_normalized": 0.046875,
                    "points": [[0.49, 0.4], [0.52, 0.65], [0.5, 0.88]],
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


class FakeRepository(PlanetRepository):
    def __init__(self):
        self.planets: list[Planet] = []
        self.saved_manifests: list[dict] = []
        self.saved_images: list[bytes] = []
        self.pruned_to: int | None = None

    def save(self, planet_id: str, display_name: str, image_bytes: bytes) -> Planet:
        planet = Planet(planet_id, f"{planet_id}.png", display_name, float(len(self.planets) + 1))
        self.planets.insert(0, planet)
        return planet

    def save_designed_with_manifest(
        self,
        planet_id: str,
        display_name: str,
        image_bytes: bytes,
        style: str,
        companions: tuple[str, ...],
        drawing_manifest: dict,
        ring_color: str,
        crater_color: str,
        mountain_color: str,
        body_color: str | None = None,
    ) -> Planet:
        planet = Planet(
            id=planet_id,
            filename=f"{planet_id}.png",
            display_name=display_name,
            created_at=float(len(self.planets) + 1),
            style=style,
            companions=companions,
            ring_color=ring_color,
            crater_color=crater_color,
            mountain_color=mountain_color,
            body_color=body_color,
            has_drawing_manifest=True,
        )
        self.saved_images.append(image_bytes)
        self.saved_manifests.append(drawing_manifest)
        self.planets.insert(0, planet)
        return planet

    def latest(self) -> Planet | None:
        return self.planets[0] if self.planets else None

    def recent(self, limit: int) -> list[Planet]:
        return self.planets[:limit]

    def clear(self) -> list[Planet]:
        removed = list(self.planets)
        self.planets.clear()
        return removed

    def prune(self, keep: int) -> None:
        self.pruned_to = keep
        del self.planets[keep:]

    def delete(self, planet_id: str) -> Planet | None:
        for index, planet in enumerate(self.planets):
            if planet.id == planet_id:
                return self.planets.pop(index)
        return None

    def resolve_image(self, filename: str) -> Path | None:
        return Path(filename)


class FakePublisher(EventPublisher):
    def __init__(self):
        self.events = []

    def publish(self, event) -> None:
        self.events.append(event)

    @asynccontextmanager
    async def subscribe(self):
        yield None


class FakeLimiter(RateLimiter):
    def __init__(self):
        self.checked: list[str] = []
        self.recorded: list[str] = []
        self.error: Exception | None = None

    def check(self, key: str) -> None:
        self.checked.append(key)
        if self.error:
            raise self.error

    def record(self, key: str) -> None:
        self.recorded.append(key)


class FakeImageProcessor(ImageProcessor):
    def __init__(self):
        self.calls = []

    def normalize_to_png(self, image_bytes: bytes, max_dimension: int, target_size: int) -> bytes:
        self.calls.append((image_bytes, max_dimension, target_size))
        return NORMALIZED


@pytest.fixture
def repository():
    return FakeRepository()


@pytest.fixture
def publisher():
    return FakePublisher()


@pytest.fixture
def limiter():
    return FakeLimiter()


@pytest.fixture
def image_processor():
    return FakeImageProcessor()


@pytest.fixture
def submit(repository, publisher, limiter, image_processor):
    return SubmitPlanetUseCase(
        repository=repository,
        publisher=publisher,
        rate_limiter=limiter,
        image_processor=image_processor,
        retention=3,
    )


def execute(submit, **overrides):
    arguments = {
        "image_bytes": PNG,
        "content_type": "image/png",
        "raw_name": "  My Planet  ",
        "client_key": "tablet-1",
        "drawing_manifest_bytes": manifest_bytes(),
    }
    arguments.update(overrides)
    return submit.execute(**arguments)


class TestSubmitPlanetUseCase:
    def test_manifest_is_required_inside_application_layer(self, submit, limiter, repository):
        with pytest.raises(ValidationError, match="manifest is required"):
            execute(submit, drawing_manifest_bytes=None)
        assert limiter.checked == ["tablet-1"]
        assert limiter.recorded == []
        assert repository.planets == []

    def test_valid_manifest_is_the_only_persistence_path(
        self, submit, repository, publisher, limiter, image_processor
    ):
        planet = execute(submit)

        assert planet.display_name == "My Planet"
        assert planet.body_color == "#ffffff"
        assert planet.has_drawing_manifest is True
        assert planet.drawing_manifest_url is not None
        assert repository.saved_images == [NORMALIZED]
        assert repository.saved_manifests[0]["background_color"] == "#ffffff"
        assert [stroke["color"] for stroke in repository.saved_manifests[0]["strokes"]] == [
            "#7b1fa2",
            "#43a047",
        ]
        assert repository.pruned_to == 3
        assert limiter.recorded == ["tablet-1"]
        assert image_processor.calls == [(PNG, 2048, 1024)]
        assert isinstance(publisher.events[-1], PlanetCreated)
        assert publisher.events[-1].planet == planet

    def test_manifest_background_becomes_body_color(self, submit):
        planet = execute(submit, drawing_manifest_bytes=manifest_bytes("#112233"))
        assert planet.body_color == "#112233"

    def test_explicit_body_color_must_match_manifest(self, submit, limiter):
        with pytest.raises(ValidationError, match="background does not match"):
            execute(
                submit,
                raw_body_color="#ffffff",
                drawing_manifest_bytes=manifest_bytes("#112233"),
            )
        assert limiter.recorded == []

    def test_style_companions_and_feature_colors_are_forwarded(self, submit):
        planet = execute(
            submit,
            raw_style="ringed",
            raw_companions="astronaut,moon",
            raw_ring_color="#123456",
            raw_crater_color="#234567",
            raw_mountain_color="#345678",
        )
        assert planet.style == "ringed"
        assert planet.companions == ("astronaut", "moon")
        assert planet.ring_color == "#123456"
        assert planet.crater_color == "#234567"
        assert planet.mountain_color == "#345678"

    def test_invalid_manifest_is_rejected_before_image_processing(
        self, submit, image_processor, limiter
    ):
        with pytest.raises(ValidationError):
            execute(submit, drawing_manifest_bytes=b"not-json")
        assert image_processor.calls == []
        assert limiter.recorded == []

    def test_invalid_content_type_is_rejected_before_processing(self, submit, image_processor):
        with pytest.raises(ValidationError):
            execute(submit, content_type="text/plain")
        assert image_processor.calls == []

    def test_empty_input_is_rejected(self, submit, image_processor):
        with pytest.raises(ValidationError):
            execute(submit, image_bytes=b"")
        assert image_processor.calls == []

    def test_size_limit_is_enforced(self, submit, image_processor):
        oversized = b"\x89PNG\r\n\x1a\n" + b"x" * 100
        with pytest.raises(ValidationError):
            execute(submit, image_bytes=oversized, max_size=16)
        assert image_processor.calls == []

    def test_successful_upload_records_cooldown_only_after_save(self, submit, limiter):
        execute(submit)
        assert limiter.checked == ["tablet-1"]
        assert limiter.recorded == ["tablet-1"]


class TestReadUseCases:
    def test_current_planet_is_empty_for_empty_repository(self, repository):
        assert GetCurrentPlanetUseCase(repository).execute() == NO_PLANET_PAYLOAD

    def test_current_planet_returns_manifest_url(self, repository):
        planet = repository.save_designed_with_manifest(
            "abc",
            "Planet",
            NORMALIZED,
            "classic",
            (),
            json.loads(manifest_bytes()),
            "#d6b06f",
            "#73808f",
            "#d98242",
            "#ffffff",
        )
        payload = GetCurrentPlanetUseCase(repository).execute()
        assert payload["id"] == planet.id
        assert payload["drawing_manifest_url"].endswith(".drawing.json")

    def test_get_by_id_finds_retained_planet(self, repository):
        first = repository.save("one", "One", NORMALIZED)
        repository.save("two", "Two", NORMALIZED)
        assert GetPlanetByIdUseCase(repository).execute(first.id) == first

    def test_get_by_id_raises_for_missing_planet(self, repository):
        with pytest.raises(NotFoundError):
            GetPlanetByIdUseCase(repository).execute("missing")

    def test_recent_planets_are_limited(self, repository):
        for index in range(5):
            repository.save(str(index), f"Planet {index}", NORMALIZED)
        payload = ListRecentPlanetsUseCase(repository, max_limit=3).execute(limit=99)
        assert len(payload["planets"]) == 3
        assert [item["name"] for item in payload["planets"]] == [
            "Planet 4",
            "Planet 3",
            "Planet 2",
        ]


class TestMutationUseCases:
    def test_delete_publishes_typed_event(self, repository, publisher):
        planet = repository.save("abc", "Planet", NORMALIZED)
        deleted = DeletePlanetUseCase(repository, publisher).execute(planet.id)
        assert deleted == planet
        assert publisher.events == [PlanetRemoved(planet.id)]

    def test_delete_unknown_raises_not_found(self, repository, publisher):
        with pytest.raises(NotFoundError):
            DeletePlanetUseCase(repository, publisher).execute("missing")
        assert publisher.events == []

    def test_clear_returns_count_and_publishes_once(self, repository, publisher):
        repository.save("one", "One", NORMALIZED)
        repository.save("two", "Two", NORMALIZED)
        removed = ClearPlanetsUseCase(repository, publisher).execute()
        assert removed == 2
        assert repository.planets == []
        assert len(publisher.events) == 1
        assert isinstance(publisher.events[0], GalaxyCleared)
