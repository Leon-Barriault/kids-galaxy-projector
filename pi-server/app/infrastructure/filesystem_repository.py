"""
Filesystem-backed planet repository.

Layout: `<id>_<safe name>.png` alongside `<id>_<safe name>.json`. The JSON
sidecar preserves the display name and the kid-selected planet design while
remaining backward-compatible with older name-only sidecars.
"""

import json
import logging
from pathlib import Path

from app.domain.naming import build_stored_filename
from app.domain.planet import Planet
from app.domain.planet_customization import DEFAULT_RING_COLOR
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
        return self.save_designed(
            planet_id=planet_id,
            display_name=display_name,
            image_bytes=image_bytes,
            style="classic",
            companions=(),
            ring_color=DEFAULT_RING_COLOR,
        )

    def save_designed(
        self,
        planet_id: str,
        display_name: str,
        image_bytes: bytes,
        style: str,
        companions: tuple[str, ...],
        ring_color: str,
    ) -> Planet:
        filename = build_stored_filename(planet_id, display_name)
        image_path = self._directory / filename
        image_path.write_bytes(image_bytes)

        planet = Planet(
            id=planet_id,
            filename=filename,
            display_name=display_name,
            created_at=image_path.stat().st_mtime,
            style=style,
            companions=companions,
            ring_color=ring_color,
        )
        self._write_metadata(planet)
        return planet

    def _write_metadata(self, planet: Planet) -> None:
        path = self._directory / planet.metadata_filename
        payload = {
            "name": planet.display_name,
            "style": planet.style,
            "companions": list(planet.companions),
            "ring_color": planet.ring_color,
        }
        try:
            with path.open("w", encoding="utf-8") as fh:
                json.dump(payload, fh, ensure_ascii=False)
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
        return sorted(
            self._directory.glob("*.png"),
            key=lambda p: (p.stat().st_mtime, p.name),
            reverse=True,
        )

    def _to_planet(self, image_path: Path) -> Planet:
        stem = image_path.stem
        planet_id = stem.split("_", 1)[0] if "_" in stem else stem
        metadata = self._read_metadata(image_path)
        fallback_name = stem.split("_", 1)[1] if "_" in stem else stem

        raw_name = metadata.get("name")
        display_name = (
            raw_name.strip()
            if isinstance(raw_name, str) and raw_name.strip()
            else fallback_name
        )

        raw_style = metadata.get("style")
        style = (
            raw_style.strip().lower()
            if isinstance(raw_style, str) and raw_style.strip()
            else "classic"
        )

        raw_companions = metadata.get("companions")
        companions = (
            tuple(item for item in raw_companions if isinstance(item, str))
            if isinstance(raw_companions, list)
            else ()
        )

        raw_ring_color = metadata.get("ring_color")
        ring_color = (
            raw_ring_color.strip().lower()
            if isinstance(raw_ring_color, str) and raw_ring_color.strip()
            else DEFAULT_RING_COLOR
        )

        return Planet(
            id=planet_id,
            filename=image_path.name,
            display_name=display_name,
            created_at=image_path.stat().st_mtime,
            style=style,
            companions=companions,
            ring_color=ring_color,
        )

    def _read_metadata(self, image_path: Path) -> dict:
        meta_path = self._directory / Path(image_path.name).with_suffix(".json").name
        if not meta_path.exists():
            return {}
        try:
            with meta_path.open("r", encoding="utf-8") as fh:
                payload = json.load(fh)
            return payload if isinstance(payload, dict) else {}
        except (OSError, ValueError) as e:
            logger.warning("Could not read metadata for %s: %s", image_path.name, e)
            return {}

    def delete(self, planet_id: str) -> Planet | None:
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

    def clear(self) -> list[Planet]:
        removed: list[Planet] = []
        for image_path in self._images_newest_first():
            planet = self._to_planet(image_path)
            try:
                image_path.unlink(missing_ok=True)
                (self._directory / planet.metadata_filename).unlink(missing_ok=True)
            except OSError as e:
                logger.warning("Could not clear %s: %s", image_path.name, e)
                continue
            removed.append(planet)
        if removed:
            logger.info("Cleared %d planet(s)", len(removed))
        return removed

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
