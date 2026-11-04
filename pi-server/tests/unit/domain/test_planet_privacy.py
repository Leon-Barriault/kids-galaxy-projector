"""Planet names stay free text, and they must not travel with the kit."""

import json
from pathlib import Path

from app.domain.naming import build_stored_filename
from app.domain.planet_privacy import (
    NEUTRAL_NAME,
    clear_stored_planet_names,
    redact_planet_names_for_backup,
)
from app.infrastructure.filesystem_repository import FileSystemPlanetRepository

CHILD_NAME = "ZebulonQuill"
ARTWORK = b"\x89PNG\r\nPNGARTWORKMARKER"


def _write_planet(
    directory: Path,
    planet_id: str,
    name: str,
    *,
    artwork: bytes = ARTWORK,
    style: str = "ringed",
) -> None:
    directory.mkdir(parents=True, exist_ok=True)
    filename = build_stored_filename(planet_id, name)
    image = directory / filename
    image.write_bytes(artwork)
    metadata = image.with_suffix(".json")
    metadata.write_text(
        json.dumps({"name": name, "style": style, "companions": ["moon"]}),
        encoding="utf-8",
    )
    manifest = directory / f"{image.stem}.drawing.json"
    manifest.write_text(json.dumps({"version": 1, "name": name}), encoding="utf-8")


def test_clear_blanks_names_and_keeps_the_drawings(tmp_path: Path):
    uploads = tmp_path / "uploads"
    _write_planet(uploads, "aaa111", CHILD_NAME)
    _write_planet(uploads, "bbb222", "SecondChild")
    (uploads / "keep.txt").write_text(f"note {CHILD_NAME}", encoding="utf-8")

    cleared = clear_stored_planet_names(uploads)

    assert cleared == 2
    assert (uploads / "keep.txt").read_text(encoding="utf-8") == "note Planet"
    images = list(uploads.glob("*.png"))
    assert len(images) == 2
    assert all(image.read_bytes() == ARTWORK for image in images)
    stored = "\n".join(
        path.read_text(encoding="utf-8", errors="ignore") + path.name
        for path in uploads.iterdir()
        if path.is_file()
    )
    assert CHILD_NAME not in stored
    assert "SecondChild" not in stored


def test_clear_names_is_safe_to_run_twice_and_the_list_is_blank(tmp_path: Path):
    repo = FileSystemPlanetRepository(tmp_path)
    repo.save("abc123", CHILD_NAME, ARTWORK)

    assert repo.clear_names() == 1
    listed = repo.recent(30)
    assert len(listed) == 1
    assert listed[0].display_name == ""
    assert listed[0].id == "abc123"
    image = next(tmp_path.glob("*.png"))
    assert image.read_bytes() == ARTWORK

    assert repo.clear_names() == 1
    again = repo.recent(30)
    assert len(again) == 1
    assert again[0].display_name == ""
    assert next(tmp_path.glob("*.png")).read_bytes() == ARTWORK


def test_clear_covers_more_than_the_thirty_planets_kept_on_the_pc(tmp_path: Path):
    uploads = tmp_path / "uploads"
    for index in range(31):
        _write_planet(uploads, f"id{index:02d}", f"Child{index:02d}Name", artwork=b"png")

    assert clear_stored_planet_names(uploads) == 31
    assert len(list(uploads.glob("*.png"))) == 31
    stored = " ".join(
        path.name + path.read_text(encoding="utf-8", errors="ignore")
        for path in uploads.iterdir()
    )
    assert "Child" not in stored


def test_clear_of_a_missing_folder_is_zero(tmp_path: Path):
    assert clear_stored_planet_names(tmp_path / "missing") == 0


def test_backup_copy_keeps_the_drawing_and_drops_the_name(tmp_path: Path):
    source = tmp_path / "uploads"
    _write_planet(source, "abc123", CHILD_NAME, style="ringed")
    (source / "notes.txt").write_text(f"label {CHILD_NAME}\n", encoding="utf-8")
    dest = tmp_path / "staged"

    count = redact_planet_names_for_backup(source, dest)

    assert count == 1
    image = dest / f"abc123_{NEUTRAL_NAME}.png"
    assert image.read_bytes() == ARTWORK
    metadata = (dest / f"abc123_{NEUTRAL_NAME}.json").read_text(encoding="utf-8")
    manifest = (dest / f"abc123_{NEUTRAL_NAME}.drawing.json").read_text(encoding="utf-8")
    notes = (dest / "notes.txt").read_text(encoding="utf-8")
    combined = metadata + manifest + notes + " ".join(path.name for path in dest.iterdir())
    assert CHILD_NAME not in combined
    assert '"style": "ringed"' in metadata
    assert NEUTRAL_NAME in metadata
    assert not (dest / build_stored_filename("abc123", CHILD_NAME)).exists()


def test_backup_copy_does_not_damage_a_style_when_the_name_is_short(tmp_path: Path):
    source = tmp_path / "uploads"
    _write_planet(source, "abc123", "ring", style="ringed")
    dest = tmp_path / "staged"

    redact_planet_names_for_backup(source, dest)

    metadata = (dest / f"abc123_{NEUTRAL_NAME}.json").read_text(encoding="utf-8")
    assert '"style": "ringed"' in metadata
    assert '"name": "Planet"' in metadata or '"name":"Planet"' in metadata
