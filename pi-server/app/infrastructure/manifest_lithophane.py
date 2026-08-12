"""Sample tablet-authored stroke manifests on a spherical lithophane.

This mirrors the projector's ManifestStrokeSurface rules without rasterising the
PNG: horizontal/diagonal stroke X spans expand to a complete longitude,
near-vertical strokes keep their authored X and follow a meridian, and paint
that reaches a canvas pole closes the whole polar cap.
"""

from __future__ import annotations

import json
import math
from pathlib import Path

POLE_REACH = 0.06
VERTICAL_ASPECT_THRESHOLD = 1.55


def load_manifest_for_image(image_path: Path) -> dict | None:
    path = image_path.with_name(f"{image_path.stem}.drawing.json")
    if not path.is_file():
        return None
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    if (
        not isinstance(payload, dict)
        or payload.get("version") != 1
        or payload.get("coordinate_space") != "normalized-canvas-v1"
        or not isinstance(payload.get("strokes"), list)
    ):
        return None
    return payload


def _projected_stroke(stroke: dict) -> tuple[list[tuple[float, float]], float, float, float] | None:
    raw_points = stroke.get("points")
    if not isinstance(raw_points, list) or len(raw_points) < 2:
        return None
    points: list[tuple[float, float]] = []
    for point in raw_points:
        if not isinstance(point, list) or len(point) != 2:
            return None
        x, y = float(point[0]), float(point[1])
        points.append((min(1.0, max(0.0, x)), min(1.0, max(0.0, y))))

    xs = [point[0] for point in points]
    ys = [point[1] for point in points]
    min_x, max_x = min(xs), max(xs)
    min_y, max_y = min(ys), max(ys)
    span_x = max(0.0001, max_x - min_x)
    span_y = max(0.0001, max_y - min_y)
    near_vertical = span_y / span_x >= VERTICAL_ASPECT_THRESHOLD
    if near_vertical:
        projected = points
    else:
        projected = [((x - min_x) / span_x, y) for x, y in points]

    width = float(stroke.get("width_normalized") or 0.02)
    return projected, min_y, max_y, min(0.35, max(0.003, width))


def _segment_distance(u: float, v: float, a: tuple[float, float], b: tuple[float, float]) -> float:
    """Distance in equirectangular texel units (U has twice V's pixel density)."""
    ax, ay = a
    bx, by = b
    # Try seam copies just like the WebGL canvas renderer's -1/0/+1 copies.
    best = float("inf")
    for shift in (-1.0, 0.0, 1.0):
        px = u + shift
        dx = (bx - ax) * 2.0
        dy = by - ay
        length_sq = dx * dx + dy * dy
        if length_sq <= 1e-12:
            candidate = math.hypot((px - ax) * 2.0, v - ay)
        else:
            tx = (px - ax) * 2.0
            ty = v - ay
            t = min(1.0, max(0.0, (tx * dx + ty * dy) / length_sq))
            candidate = math.hypot(tx - t * dx, ty - t * dy)
        best = min(best, candidate)
    return best


def manifest_relief_strength(manifest: dict, latitude: float, longitude: float) -> float:
    """Return 0..1 embossed-paint strength at a spherical sample."""
    # Canvas top is the north pole; bottom is the south pole.
    v = 0.5 - latitude / math.pi
    u = (longitude + math.pi) / math.tau
    u %= 1.0
    v = min(1.0, max(0.0, v))

    relief = 0.0
    for stroke in manifest.get("strokes", []):
        projected = _projected_stroke(stroke)
        if projected is None:
            continue
        points, min_y, max_y, width = projected
        half_width = width * 0.5

        if min_y <= POLE_REACH and v <= min_y + width * 0.7:
            relief = 1.0
            continue
        if max_y >= 1.0 - POLE_REACH and v >= max_y - width * 0.7:
            relief = 1.0
            continue

        distance = min(
            _segment_distance(u, v, points[index], points[index + 1])
            for index in range(len(points) - 1)
        )
        if distance > half_width:
            continue
        # Rounded cross-section: centreline is thickest and the edge blends to
        # the minimum wall rather than producing a rectangular ridge.
        normalized = 1.0 - distance / max(half_width, 1e-6)
        rounded = math.sin(normalized * math.pi / 2.0) ** 1.35
        relief = max(relief, rounded)
    return relief
