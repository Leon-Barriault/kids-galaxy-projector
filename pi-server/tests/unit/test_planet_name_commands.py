"""The pack-up command and the USB backup both keep planet names off the kit."""

import json
import os
import subprocess
import tarfile
from pathlib import Path

from app.domain.naming import build_stored_filename

REPO = Path(__file__).resolve().parents[3]
CHILD_NAME = "ZebulonQuill"
ARTWORK = b"\x89PNG\r\nPNGARTWORKMARKER"


def _write_planet(directory: Path) -> None:
    directory.mkdir(parents=True, exist_ok=True)
    filename = build_stored_filename("abc123", CHILD_NAME)
    image = directory / filename
    image.write_bytes(ARTWORK)
    image.with_suffix(".json").write_text(
        json.dumps({"name": CHILD_NAME, "style": "classic"}),
        encoding="utf-8",
    )
    (directory / f"{image.stem}.drawing.json").write_text(
        json.dumps({"name": CHILD_NAME}),
        encoding="utf-8",
    )


def test_clear_planet_names_command_wipes_the_stored_list(tmp_path: Path):
    uploads = tmp_path / "uploads"
    _write_planet(uploads)
    (uploads / "keep.txt").write_text("keep-me", encoding="utf-8")
    env = os.environ.copy()
    env["UPLOAD_DIR"] = str(uploads)

    result = subprocess.run(
        ["bash", "scripts/clear_planet_names.sh"],
        cwd=REPO,
        env=env,
        check=True,
        capture_output=True,
        text=True,
    )

    assert "The planet names were cleared." in result.stdout
    assert (uploads / "keep.txt").read_text(encoding="utf-8") == "keep-me"
    images = list(uploads.glob("*.png"))
    assert len(images) == 1
    assert images[0].read_bytes() == ARTWORK
    disk = "\n".join(
        path.read_text(encoding="utf-8", errors="ignore") + path.name
        for path in uploads.rglob("*")
        if path.is_file()
    )
    assert CHILD_NAME not in disk


def test_backup_room_leaves_planet_names_out_of_the_archive(tmp_path: Path):
    uploads = tmp_path / "uploads"
    certs = tmp_path / "certs"
    state = tmp_path / "state"
    backups = tmp_path / "backups"
    _write_planet(uploads)
    certs.mkdir()
    state.mkdir()
    (certs / "ca.crt").write_text("certificate-marker", encoding="utf-8")
    env = os.environ.copy()
    env["UPLOAD_DIR"] = str(uploads)
    env["CERTS_DIR"] = str(certs)
    env["STATE_DIR"] = str(state)
    env["KIDS_GALAXY_BACKUP_DIR"] = str(backups)

    subprocess.run(
        ["bash", "scripts/backup_room.sh"],
        cwd=REPO,
        env=env,
        check=True,
        capture_output=True,
        text=True,
    )

    archives = list(backups.glob("kids-galaxy-*.tar.gz"))
    assert len(archives) == 1
    with tarfile.open(archives[0], "r:gz") as archive:
        member_names = archive.getnames()
        payload = b"".join(
            archive.extractfile(member).read()
            for member in archive.getmembers()
            if member.isfile() and archive.extractfile(member) is not None
        )
    joined_names = " ".join(member_names)
    assert CHILD_NAME not in joined_names
    assert CHILD_NAME.encode() not in payload
    assert ARTWORK in payload
    assert b"certificate-marker" in payload
    assert any(name.endswith("ca.crt") for name in member_names)
