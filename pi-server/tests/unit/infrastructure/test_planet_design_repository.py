import json

from app.infrastructure.filesystem_repository import FileSystemPlanetRepository


def test_design_metadata_round_trips(tmp_path):
    repository = FileSystemPlanetRepository(tmp_path)

    saved = repository.save_designed(
        planet_id="abc123",
        display_name="Peak World",
        image_bytes=b"png-bytes",
        style="spiky",
        companions=("moon", "astronaut"),
    )

    reloaded = repository.latest()
    assert reloaded is not None
    assert reloaded.id == saved.id
    assert reloaded.style == "spiky"
    assert reloaded.companions == ("moon", "astronaut")


def test_legacy_name_only_sidecar_defaults_to_classic(tmp_path):
    repository = FileSystemPlanetRepository(tmp_path)
    image = tmp_path / "old123_Old_World.png"
    image.write_bytes(b"png-bytes")
    image.with_suffix(".json").write_text(json.dumps({"name": "Old World"}), encoding="utf-8")

    planet = repository.latest()

    assert planet is not None
    assert planet.display_name == "Old World"
    assert planet.style == "classic"
    assert planet.companions == ()
