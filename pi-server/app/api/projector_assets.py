"""Serve the projector so the wall always runs the code the server has.

The wall is a kiosk Chrome with a persistent profile that stays open for days.
Plain StaticFiles answers with an ETag and Last-Modified but no Cache-Control,
and for that Chrome applies heuristic freshness - roughly a tenth of a file's
age - to every ES module the page imports. A module last changed a month ago is
then reused for about three days without asking the server, through page
reloads and restarts alike. The server gets updated, the manager tablet can
switch a new rendering on, and the wall keeps running yesterday's projector.

Three things close that gap:

- every projector asset is served ``Cache-Control: no-cache``, so the browser
  revalidates each one; an unchanged file costs a 304 on the local network;
- the page loads its assets from ``/static/r/<build>/``, where ``<build>`` is a
  fingerprint of the static files, so any change gives every module a new URL -
  which also defeats copies cached before this existed;
- the gallery API carries the same fingerprint in ``X-Kids-Galaxy-Build``, so a
  wall that is already open notices an update and reloads itself.
"""

from __future__ import annotations

import hashlib
import os
import re
import time
from pathlib import Path, PurePosixPath

from starlette.staticfiles import StaticFiles
from starlette.types import Scope

BUILD_SEGMENT = "r"
BUILD_HEADER = "X-Kids-Galaxy-Build"
NO_CACHE = "no-cache"

# Only quoted, absolute /static/ references are rewritten: the script src, the
# import map and the favicon. Prose or comments that mention the directory are
# left as they are.
_STATIC_REFERENCE = re.compile(r'(["\'])/static/')


class BuildFingerprint:
    """A short fingerprint of everything under the static directory.

    Built from relative path, size and modification time, so it changes when a
    deployment changes any projector file and stays put across a rebuild that
    changes nothing. The room image bakes the static files in, but development
    bind-mounts them, so the value is refreshed after a short TTL rather than
    computed once.
    """

    def __init__(self, static_dir: Path, ttl_seconds: float = 5.0):
        self._static_dir = static_dir
        self._ttl_seconds = ttl_seconds
        self._value: str | None = None
        self._computed_at = 0.0

    def current(self) -> str:
        now = time.monotonic()
        if self._value is None or now - self._computed_at >= self._ttl_seconds:
            self._value = self._compute()
            self._computed_at = now
        return self._value

    def _compute(self) -> str:
        digest = hashlib.sha256()
        if self._static_dir.is_dir():
            for path in sorted(self._static_dir.rglob("*")):
                if not path.is_file():
                    continue
                stat = path.stat()
                relative = path.relative_to(self._static_dir).as_posix()
                digest.update(f"{relative}:{stat.st_size}:{stat.st_mtime_ns}\n".encode())
        return digest.hexdigest()[:12]


def render_projector_page(index_html: str, build: str) -> str:
    """Point the page's assets at the current build and record which build it is."""
    page = _STATIC_REFERENCE.sub(rf"\g<1>/static/{BUILD_SEGMENT}/{build}/", index_html)
    meta = f'  <meta name="kids-galaxy-build" content="{build}" />\n'
    head_end = page.find("</head>")
    if head_end == -1:
        return meta + page
    return page[:head_end] + meta + page[head_end:]


class ProjectorStaticFiles(StaticFiles):
    """StaticFiles that always revalidates and accepts a build prefix.

    ``/static/r/<build>/galaxy.js`` serves the same file as ``/static/galaxy.js``.
    The build segment only exists to give every asset a new URL per deployment;
    the file is looked up by the parent class, which keeps its traversal guard.
    """

    def get_path(self, scope: Scope) -> str:
        path = super().get_path(scope)
        parts = PurePosixPath(path.replace(os.sep, "/")).parts
        if len(parts) >= 3 and parts[0] == BUILD_SEGMENT:
            return os.path.join(*parts[2:])
        return path

    def file_response(self, *args, **kwargs):
        response = super().file_response(*args, **kwargs)
        response.headers["Cache-Control"] = NO_CACHE
        return response
