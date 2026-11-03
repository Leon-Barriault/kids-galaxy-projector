#!/usr/bin/env python3
"""Clear the stored planet list, or copy uploads with the names removed."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)

    clear = commands.add_parser("clear", help="Delete the stored planet list.")
    clear.add_argument("--uploads", type=Path, required=True)

    redact = commands.add_parser("redact", help="Copy uploads without child names.")
    redact.add_argument("--source", type=Path, required=True)
    redact.add_argument("--dest", type=Path, required=True)

    args = parser.parse_args(argv)
    sys.path.insert(0, str(ROOT / "pi-server"))
    from app.domain.planet_privacy import (  # noqa: E402
        clear_stored_planet_names,
        redact_planet_names_for_backup,
    )

    if args.command == "clear":
        clear_stored_planet_names(args.uploads)
        return 0
    redact_planet_names_for_backup(args.source, args.dest)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
