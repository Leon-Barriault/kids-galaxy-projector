"""
Infrastructure: the filesystem-backed planet repository.

Exercised against a real temp directory - this is the layer whose whole job is
disk I/O, so faking it would test nothing.
"""

import json

import pytest

from app.infrastructure.filesystem_repository import FileSystemPlanetRepository

PNG = b"\x89PNG\r\n\x1a\n payload"


@pytest.fixture
def repo(tmp_path):
    return FileSystemPlanetRepository(tmp_path)


class TestSave:
    def test_writes_image_and_sidecar(self, repo, tmp_path):
        planet = repo.save("abc123", "My Planet", PNG)

        image = tmp_path / planet.filename
        assert image.read_bytes() == PNG

        sidecar = tmp_path / planet.metadata_filename
        assert json.loads(sidecar.read_text(encoding="utf-8"))["name"] == "My Planet"

    def test_display_name_survives_characters_the_filename_cannot(self, repo):
        planet = repo.save("abc123", "Alice's World!", PNG)
        assert "'" not in planet.filename  # filesystem-safe
        assert repo.latest().display_name == "Alice's World!"  # verbatim

    def test_creates_directory_if_missing(self, tmp_path):
        nested = tmp_path / "does" / "not" / "exist"
        repo = FileSystemPlanetRepository(nested)
        repo.save("abc123", "Planet", PNG)
        assert (nested / "abc123_Planet.png").exists()


class TestLatest:
    def test_returns_none_when_empty(self, repo):
        assert repo.latest() is None

    def test_returns_most_recent_by_mtime(self, repo, tmp_path):
        import os

        first = repo.save("id1", "First", PNG)
        second = repo.save("id2", "Second", PNG)
        os.utime(tmp_path / first.filename, (1000, 1000))
        os.utime(tmp_path / second.filename, (2000, 2000))

        assert repo.latest().display_name == "Second"

    def test_recovers_name_when_sidecar_is_missing(self, repo, tmp_path):
        planet = repo.save("id1", "Legacy Planet", PNG)
        (tmp_path / planet.metadata_filename).unlink()
        assert repo.latest().display_name == "Legacy Planet"

    def test_recovers_name_when_sidecar_is_corrupt(self, repo, tmp_path):
        planet = repo.save("id1", "Fallback", PNG)
        (tmp_path / planet.metadata_filename).write_text("{broken", encoding="utf-8")
        assert repo.latest().display_name == "Fallback"

    def test_ignores_non_png_files(self, repo, tmp_path):
        (tmp_path / "notes.txt").write_text("ignore me", encoding="utf-8")
        assert repo.latest() is None


class TestPrune:
    def test_keeps_only_the_newest(self, repo, tmp_path):
        import os

        for i in range(5):
            planet = repo.save(f"id{i}", f"Planet {i}", PNG)
            os.utime(tmp_path / planet.filename, (1000 + i * 10, 1000 + i * 10))

        repo.prune(keep=2)

        remaining = sorted(p.name for p in tmp_path.glob("*.png"))
        assert remaining == ["id3_Planet 3.png", "id4_Planet 4.png"]

    def test_removes_sidecars_with_their_images(self, repo, tmp_path):
        import os

        for i in range(3):
            planet = repo.save(f"id{i}", f"Planet {i}", PNG)
            os.utime(tmp_path / planet.filename, (1000 + i, 1000 + i))

        repo.prune(keep=1)

        assert sorted(p.name for p in tmp_path.glob("*.json")) == ["id2_Planet 2.json"]

    def test_noop_when_under_cap(self, repo, tmp_path):
        repo.save("id0", "Only", PNG)
        repo.prune(keep=10)
        assert len(list(tmp_path.glob("*.png"))) == 1

    def test_keep_zero_or_negative_disables_pruning(self, repo, tmp_path):
        repo.save("id0", "Keep", PNG)
        repo.prune(keep=0)
        repo.prune(keep=-5)
        assert len(list(tmp_path.glob("*.png"))) == 1


class TestPathTraversalSafety:
    def test_resolve_rejects_escaping_names(self, repo):
        assert repo.resolve_image("../../etc/passwd") is None

    def test_resolve_returns_path_for_existing_image(self, repo):
        planet = repo.save("id1", "Real", PNG)
        resolved = repo.resolve_image(planet.filename)
        assert resolved is not None and resolved.exists()

    def test_resolve_returns_none_for_missing_image(self, repo):
        assert repo.resolve_image("nope.png") is None
