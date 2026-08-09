import json

from app.domain.planet_customization import (
    DEFAULT_CRATER_COLOR,
    DEFAULT_MOUNTAIN_COLOR,
    DEFAULT_RING_COLOR,
)
from app.infrastructure.filesystem_repository import FileSystemPlanetRepository


def test_design_metadata_round_trips(tmp_path):
    repository = FileSystemPlanetRepository(tmp_path)

    saved = repository.save_designed(
        planet_id="abc123",
        display_name="Adventure World",
        image_bytes=b"png-bytes",
        style="spiky",
        companions=("moon", "astronaut"),
        ring_color="#4fc3f7",
        crater_color="#ab47bc",
        mountain_color="#66bb6a",
    )

    reloaded = repository.latest()
    assert reloaded is not None
    assert reloaded.id == saved.id
    assert reloaded.style == "spiky"
    assert reloaded.companions == ("moon", "astronaut")
    assert reloaded.ring_color == "#4fc3f7"
    assert reloaded.crater_color == "#ab47bc"
    assert reloaded.mountain_color == "#66bb6a"


def test_legacy_name_only_sidecar_defaults_to_classic(tmp_path):
    repository = FileSystemPlanetRepository(tmp_path)
    image = tmp_path / "old123_Old_World.png"
    image.write_bytes(b"png-bytes")
    image.with_suffix(".json").write_text(
        json.dumps({"name": "Old World"}),
        encoding="utf-8",
    )

    planet = repository.latest()

    assert planet is not None
    assert planet.display_name == "Old World"
    assert planet.style == "classic"
    assert planet.companions == ()
    assert planet.ring_color == DEFAULT_RING_COLOR
    assert planet.crater_color == DEFAULT_CRATER_COLOR
    assert planet.mountain_color == DEFAULT_MOUNTAIN_COLOR
