"""
Filesystem-backed planet repository.

Layout: `<id>_<safe name>.png` alongside `<id>_<safe name>.json` holding the
display name. The sidecar exists because the filename is lossy by design - it
cannot carry apostrophes, accents or punctuation, and it carries the internal
id, which must never reach the projector.
"""

import json
import logging
from pathlib import Path

from app.domain.naming import build_stored_filename
from app.domain.planet import Planet
from app.ports import PlanetRepository

logger = logging.getLogger(__name__)


class FileSystemPlanetRepository(PlanetRepository):
    def __init__(self, directory: Path):
        self._directory = Path(directory)
        self._directory.mkdir(parents=True, exist_ok=True)

    @property
    def directory(self) -> Path:
        return self._directory

    def save(self, planet_id: str, display_name: str, image_bytes: bytes) -> Planet:
        filename = build_stored_filename(planet_id, display_name)
        image_path = self._directory / filename
        image_path.write_bytes(image_bytes)

        planet = Planet(
            id=planet_id,
            filename=filename,
            display_name=display_name,
            created_at=image_path.stat().st_mtime,
        )
        self._write_metadata(planet)
        return planet

    def _write_metadata(self, planet: Planet) -> None:
        path = self._directory / planet.metadata_filename
        try:
            with path.open("w", encoding="utf-8") as fh:
                json.dump({"name": planet.display_name}, fh, ensure_ascii=False)
        except OSError as e:
            logger.warning("Could not write metadata for %s: %s", planet.filename, e)

    def latest(self) -> Planet | None:
        images = self._images_newest_first()
        if not images:
            return None
        return self._to_planet(images[0])

    def recent(self, limit: int) -> list[Planet]:
        if limit <= 0:
            return []
        return [self._to_planet(image) for image in self._images_newest_first()[:limit]]

    def _images_newest_first(self) -> list[Path]:
        # Secondary key on name so two saves in the same second stay ordered
        # deterministically (integration tests and the manager list both care).
        return sorted(
            self._directory.glob("*.png"),
            key=lambda p: (p.stat().st_mtime, p.name),
            reverse=True,
        )

    def _to_planet(self, image_path: Path) -> Planet:
        stem = image_path.stem
        planet_id = stem.split("_", 1)[0] if "_" in stem else stem
        return Planet(
            id=planet_id,
            filename=image_path.name,
            display_name=self._read_display_name(image_path),
            created_at=image_path.stat().st_mtime,
        )

    def _read_display_name(self, image_path: Path) -> str:
        meta_path = self._directory / Path(image_path.name).with_suffix(".json").name
        if meta_path.exists():
            try:
                with meta_path.open("r", encoding="utf-8") as fh:
                    name = json.load(fh).get("name")
                if isinstance(name, str) and name.strip():
                    return name.strip()
            except (OSError, ValueError) as e:
                logger.warning(
                    "Could not read metadata for %s: %s", image_path.name, e
                )

        stem = image_path.stem
        return stem.split("_", 1)[1] if "_" in stem else stem

    def delete(self, planet_id: str) -> Planet | None:
        """
        Remove the image and its sidecar for `planet_id`.

        Matching is by the id prefix of the stored filename (the same id the
        projector and the manager app use), not by display name.
        """
        for image_path in self._images_newest_first():
            planet = self._to_planet(image_path)
            if planet.id != planet_id:
                continue
            try:
                image_path.unlink(missing_ok=True)
                meta = self._directory / planet.metadata_filename
                meta.unlink(missing_ok=True)
                logger.info("Deleted planet %s (%s)", planet.id, planet.display_name)
            except OSError as e:
                logger.warning("Could not delete %s: %s", image_path.name, e)
                return None
            return planet
        return None

    def resolve_image(self, filename: str) -> Path | None:
        candidate = (self._directory / Path(filename).name).resolve()
        try:
            candidate.relative_to(self._directory.resolve())
        except ValueError:
            logger.warning("Rejected out-of-tree upload path: %s", filename)
            return None
        if not candidate.is_file():
            return None
        return candidate

    def prune(self, keep: int) -> None:
        if keep <= 0:
            return
        for stale in self._images_newest_first()[keep:]:
            try:
                stale.unlink(missing_ok=True)
                (self._directory / Path(stale.name).with_suffix(".json").name).unlink(
                    missing_ok=True
                )
                logger.info("Pruned old planet: %s", stale.name)
            except OSError as e:
                logger.warning("Could not prune %s: %s", stale.name, e)
