"""The wall's heartbeat budget has to outlast the server's heartbeat."""

from __future__ import annotations

import re
from pathlib import Path

from app.api.sse import SSE_HEARTBEAT_SECONDS, SSE_RETRY_MS

WALL_SOURCE = Path(__file__).resolve().parents[3] / "static" / "projector" / "LiveUpdates.js"


def test_wall_heartbeat_budget_covers_two_server_intervals():
    source = WALL_SOURCE.read_text(encoding="utf-8")
    match = re.search(r"export const HEARTBEAT_TIMEOUT_MS = (\d+);", source)
    assert match, "wall heartbeat budget missing"
    timeout_ms = int(match.group(1))
    assert timeout_ms >= SSE_HEARTBEAT_SECONDS * 1000 * 2
    assert SSE_RETRY_MS <= 2000
