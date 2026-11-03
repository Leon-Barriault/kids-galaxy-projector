"""Keep child-typed planet names from travelling with the kit.

Children may type any planet name. The PC stores that gallery, at most 30
planets, and the same computer visits the next daycare. Pack-up deletes the
stored list. A USB safety copy may still keep the drawings, but not the names.
"""

from __future__ import annotations

import json
from pathlib import Path

NEUTRAL_NAME = "Planet"
NAME_CLEARED = "name_cleared"
DRAWING_SUFFIX = ".drawing.json"
_IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg", ".webp"}


def clear_stored_planet_names(upload_dir: Path) -> int:
    """Remove child-typed names and keep the drawings.

    The gallery list stays. Each planet's display name becomes blank, and the
    filename no longer contains the typed name. Running it again is safe:
    planets that are already cleared are left as they are. Returns how many
    planets are stored, including ones already cleared.
    """
    if not upload_dir.is_dir():
        return 0
    groups = _planet_groups(upload_dir)
    fragments = _name_fragments(groups)
    for stem, paths in groups.items():
        _clear_group(upload_dir, stem, paths, fragments)
    for path in _files(upload_dir):
        if _is_planet_file(path) or path.suffix.lower() in _IMAGE_SUFFIXES:
            continue
        path.write_bytes(_scrub_plain_text(path.read_bytes(), fragments))
    return len(groups)


def redact_planet_names_for_backup(source: Path, dest: Path) -> int:
    """Copy an upload folder with child names removed.

    Drawings are copied byte for byte. Names are removed from filenames and
    from the name field. ``dest`` must not live inside ``source``.
    """
    if not source.is_dir():
        dest.mkdir(parents=True, exist_ok=True)
        return 0
    source_resolved = source.resolve()
    dest_resolved = dest.resolve()
    if dest_resolved == source_resolved or source_resolved in dest_resolved.parents:
        raise ValueError("backup destination must not be inside the upload folder")

    groups = _planet_groups(source)
    fragments = _name_fragments(groups)
    planet_paths = {path.resolve() for paths in groups.values() for path in paths}
    dest.mkdir(parents=True, exist_ok=True)

    for stem, paths in groups.items():
        new_stem = _neutral_stem(stem)
        metadata_payload: dict | None = None
        metadata_path = _metadata_path(paths)
        if metadata_path is not None:
            metadata_payload = _load_object(metadata_path)
        if metadata_payload is None:
            metadata_payload = {}
        metadata_payload["name"] = NEUTRAL_NAME
        _write_json(dest / f"{new_stem}.json", _scrub(metadata_payload, fragments))

        for path in paths:
            if path.resolve() == (metadata_path.resolve() if metadata_path else None):
                continue
            target = dest / _renamed(path, new_stem)
            if path.name.endswith(DRAWING_SUFFIX):
                target.write_bytes(_scrubbed_manifest(path, fragments))
            elif path.suffix.lower() in _IMAGE_SUFFIXES:
                target.write_bytes(path.read_bytes())
            else:
                target.write_bytes(_scrub_plain_text(path.read_bytes(), fragments))

    for path in _files(source):
        if path.resolve() in planet_paths:
            continue
        target = dest / path.name
        if path.suffix.lower() in _IMAGE_SUFFIXES:
            target.write_bytes(path.read_bytes())
        else:
            target.write_bytes(_scrub_plain_text(path.read_bytes(), fragments))
    return len(groups)


def _clear_group(
    upload_dir: Path,
    stem: str,
    paths: list[Path],
    fragments: set[str],
) -> None:
    planet_id = stem.split("_", 1)[0] if "_" in stem else stem
    if not planet_id:
        planet_id = "planet"
    new_stem = f"{planet_id}_{NEUTRAL_NAME}"
    metadata_path = _metadata_path(paths)
    payload = _load_object(metadata_path) if metadata_path is not None else None
    if payload is None:
        payload = {}
    if payload.get(NAME_CLEARED) is True and stem == new_stem:
        return

    payload = _scrub(payload, fragments)
    if not isinstance(payload, dict):
        payload = {}
    payload["name"] = ""
    payload[NAME_CLEARED] = True

    written: dict[str, bytes] = {f"{new_stem}.json": _json_bytes(payload)}
    for path in paths:
        if metadata_path is not None and path.resolve() == metadata_path.resolve():
            continue
        if path.name.endswith(DRAWING_SUFFIX):
            written[_renamed(path, new_stem)] = _scrubbed_manifest(path, fragments)
        elif path.suffix.lower() in _IMAGE_SUFFIXES:
            written[_renamed(path, new_stem)] = path.read_bytes()
        else:
            written[_renamed(path, new_stem)] = _scrub_plain_text(path.read_bytes(), fragments)

    for name, data in written.items():
        (upload_dir / name).write_bytes(data)
    for path in paths:
        if path.name not in written:
            path.unlink(missing_ok=True)


def _json_bytes(payload: dict) -> bytes:
    return json.dumps(payload, ensure_ascii=False).encode("utf-8")


def _planet_groups(upload_dir: Path) -> dict[str, list[Path]]:
    groups: dict[str, list[Path]] = {}
    for path in _files(upload_dir):
        if not _is_planet_file(path):
            continue
        groups.setdefault(_group_key(path), []).append(path)
    return groups


def _files(root: Path) -> list[Path]:
    return [path for path in root.iterdir() if path.is_file() and not path.is_symlink()]


def _is_planet_file(path: Path) -> bool:
    if path.name.endswith(DRAWING_SUFFIX):
        return True
    return path.suffix.lower() in {".png", ".json"}


def _group_key(path: Path) -> str:
    if path.name.endswith(DRAWING_SUFFIX):
        return path.name[: -len(DRAWING_SUFFIX)]
    return path.stem


def _neutral_stem(stem: str) -> str:
    planet_id = stem.split("_", 1)[0] if "_" in stem else stem
    if not planet_id:
        planet_id = "planet"
    return f"{planet_id}_{NEUTRAL_NAME}"


def _metadata_path(paths: list[Path]) -> Path | None:
    for path in paths:
        if path.suffix.lower() == ".json" and not path.name.endswith(DRAWING_SUFFIX):
            return path
    return None


def _name_fragments(groups: dict[str, list[Path]]) -> set[str]:
    found: set[str] = set()
    for stem, paths in groups.items():
        if "_" in stem:
            filename_name = stem.split("_", 1)[1].strip()
            if filename_name and filename_name != NEUTRAL_NAME:
                found.add(filename_name)
        metadata = _metadata_path(paths)
        if metadata is None:
            continue
        payload = _load_object(metadata)
        if payload is None:
            continue
        raw_name = payload.get("name")
        if isinstance(raw_name, str) and raw_name.strip() and raw_name.strip() != NEUTRAL_NAME:
            found.add(raw_name.strip())
    return found


def _renamed(path: Path, new_stem: str) -> str:
    if path.name.endswith(DRAWING_SUFFIX):
        return f"{new_stem}{DRAWING_SUFFIX}"
    return f"{new_stem}{path.suffix}"


def _load_object(path: Path) -> dict | None:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError):
        return None
    if not isinstance(payload, dict):
        return None
    return payload


def _write_json(path: Path, payload: dict) -> None:
    path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")


def _scrub(value: object, fragments: set[str]) -> object:
    if isinstance(value, str):
        return NEUTRAL_NAME if value in fragments else value
    if isinstance(value, list):
        return [_scrub(item, fragments) for item in value]
    if isinstance(value, dict):
        return {key: _scrub(item, fragments) for key, item in value.items()}
    return value


def _scrubbed_manifest(path: Path, fragments: set[str]) -> bytes:
    payload = _load_object(path)
    if payload is None:
        return _scrub_plain_text(path.read_bytes(), fragments)
    scrubbed = _scrub(payload, fragments)
    return json.dumps(scrubbed, ensure_ascii=False).encode("utf-8")


def _scrub_plain_text(data: bytes, fragments: set[str]) -> bytes:
    for fragment in sorted(fragments, key=len, reverse=True):
        if len(fragment) < 3:
            continue
        encoded = fragment.encode("utf-8")
        if encoded:
            data = data.replace(encoded, NEUTRAL_NAME.encode("utf-8"))
    return data
