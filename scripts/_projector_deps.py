#!/usr/bin/env python3
"""Fail the projector checks with an instruction rather than a traceback.

These scripts need Playwright, Pillow and httpx, and until recently those pins
lived only inside .github/workflows/projector-ci.yml. CI was therefore green
while anyone running the same script locally met a bare ModuleNotFoundError -
and then, having installed that one package, met the next. Checking the whole
set up front turns three rounds of guessing into one command.

The set is checked as a bundle even though not every script imports all three,
because a single `make install-projector-checks` satisfies all of them and there
is nothing useful to be gained from reporting them one at a time.
"""

from __future__ import annotations

import importlib.util
import sys

# Module name -> what it is called when you go to install it.
_REQUIRED = {
    "playwright": "playwright",
    "PIL": "Pillow",
    "httpx": "httpx",
}


def require() -> None:
    """Exit with an actionable message if the browser-check dependencies are absent."""
    missing = [
        package
        for module, package in _REQUIRED.items()
        if importlib.util.find_spec(module) is None
    ]
    if not missing:
        return

    print(
        "\n".join(
            [
                "",
                f"The projector checks need {', '.join(missing)}, which "
                f"{'is' if len(missing) == 1 else 'are'} not installed.",
                "",
                "    make install-projector-checks",
                "",
                "or, without make:",
                "",
                "    pip install -r pi-server/requirements-projector.txt",
                "    python -m playwright install --with-deps chromium",
                "",
                "Note that requirements-dev.txt alone is not enough: it pins httpx2 for "
                "Starlette's TestClient, which imports as `httpx2` and does not provide "
                "the `httpx` these scripts use.",
                "",
            ]
        ),
        file=sys.stderr,
    )
    raise SystemExit(1)
