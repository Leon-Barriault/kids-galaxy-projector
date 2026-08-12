"""Sample tablet-authored stroke manifests on a spherical lithophane.

This mirrors the projector's ManifestStrokeSurface rules without rasterising the
PNG: horizontal strokes become complete latitude layers, near-vertical strokes
keep their authored longitude, pole-owning strokes close the cap, and every
authored stroke receives its own deterministic mixed-heuristic emboss height.
"""

from __future__ import annotations

import json
import math
from pathlib import Path

POLE_CLAIM_THRESHOLD = 0.22
VERTICAL_ASPECT_THRESHOLD = 1.55
HORIZONTAL_BAND_ASPECT_THRESHOLD = 2.25
HORIZONTAL_POLE_ASPECT_THRESHOLD = 1.1
SHOULDER_FLOOR = 0.28
MIN_LAYER_LEVEL = 0.6
MAX_LAYER_LEVEL = 0.98
ORDER_WEIGHT = 0.35
WIDTH_WEIGHT = 0.25
COVERAGE_WEIGHT = 0.20
POLE_WEIGHT = 0.10
JITTER_WEIGHT = 0.10


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


def _stable_stroke_id(stroke: dict, stroke_index: int) -> str:
    value = stroke.get("stroke_id")
    if isinstance(value, str) and value.strip():
        return value.strip()
    return f"stroke-{stroke_index:04d}"


def _stable_unit_hash(value: str) -> float:
    """FNV-1a compatible with ManifestStrokeSurface.js, returned as 0..1."""
    hash_value = 0x811C9DC5
    for character in value:
        hash_value ^= ord(character)
        hash_value = (hash_value * 0x01000193) & 0xFFFFFFFF
    return hash_value / 0xFFFFFFFF


def _projected_stroke(stroke: dict, stroke_index: int) -> dict | None:
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
    vertical_aspect = span_y / span_x
    horizontal_aspect = span_x / span_y
    near_vertical = vertical_aspect >= VERTICAL_ASPECT_THRESHOLD
    horizontal_band = not near_vertical and horizontal_aspect >= HORIZONTAL_BAND_ASPECT_THRESHOLD
    horizontal_pole_candidate = (
        not near_vertical and horizontal_aspect >= HORIZONTAL_POLE_ASPECT_THRESHOLD
    )
    projected = points if near_vertical else [((x - min_x) / span_x, y) for x, y in points]

    width = min(0.35, max(0.003, float(stroke.get("width_normalized") or 0.02)))
    half_width = width * 0.5
    path_length = sum(
        math.hypot(
            points[index][0] - points[index - 1][0],
            points[index][1] - points[index - 1][1],
        )
        for index in range(1, len(points))
    )
    coverage_metric = min(
        1.0,
        max(0.0, span_x * 0.55 + span_y * 0.25 + min(1.0, path_length) * 0.20),
    )
    raw_order = stroke.get("order", stroke_index)
    order = float(raw_order) if isinstance(raw_order, (int, float)) else float(stroke_index)

    return {
        "stroke_index": stroke_index,
        "stroke_id": _stable_stroke_id(stroke, stroke_index),
        "order": order,
        "points": projected,
        "min_y": min_y,
        "max_y": max_y,
        "center_y": sum(ys) / len(ys),
        "band_from": min(1.0, max(0.0, min_y - half_width)),
        "band_to": min(1.0, max(0.0, max_y + half_width)),
        "near_vertical": near_vertical,
        "horizontal_band": horizontal_band,
        "horizontal_pole_candidate": horizontal_pole_candidate,
        "width": width,
        "coverage_metric": coverage_metric,
        "color": str(stroke.get("color") or "#ffffff").lower(),
    }


def _choose_pole_owners(projections: list[dict]) -> dict[str, int]:
    candidates = [
        projection
        for projection in projections
        if projection["horizontal_pole_candidate"]
    ]
    north_candidates = [
        projection
        for projection in candidates
        if projection["band_from"] <= POLE_CLAIM_THRESHOLD
    ]
    south_candidates = [
        projection
        for projection in candidates
        if projection["band_to"] >= 1.0 - POLE_CLAIM_THRESHOLD
    ]
    north_candidates.sort(key=lambda projection: (projection["band_from"], projection["center_y"]))
    south_candidates.sort(
        key=lambda projection: (-projection["band_to"], -projection["center_y"])
    )
    return {
        "north": north_candidates[0]["stroke_index"] if north_candidates else -1,
        "south": south_candidates[0]["stroke_index"] if south_candidates else -1,
    }


def _metric_scores(projections: list[dict], field: str) -> dict[int, float]:
    if not projections:
        return {}
    values = [float(projection[field]) for projection in projections]
    minimum = min(values)
    maximum = max(values)
    if maximum - minimum < 1e-6:
        return {projection["stroke_index"]: 0.5 for projection in projections}
    return {
        projection["stroke_index"]: (float(projection[field]) - minimum) / (maximum - minimum)
        for projection in projections
    }


def manifest_stroke_profiles(manifest: dict) -> list[dict]:
    """Return deterministic per-stroke emboss profiles using the WebGL heuristic."""
    projections = [
        projection
        for index, stroke in enumerate(manifest.get("strokes", []))
        if (projection := _projected_stroke(stroke, index)) is not None
    ]
    pole_owners = _choose_pole_owners(projections)
    order_scores = _metric_scores(projections, "order")
    width_scores = _metric_scores(projections, "width")
    coverage_scores = _metric_scores(projections, "coverage_metric")

    profiles = []
    for projection in projections:
        stroke_index = projection["stroke_index"]
        order_score = order_scores.get(stroke_index, 0.5)
        width_score = width_scores.get(stroke_index, 0.5)
        coverage_score = coverage_scores.get(stroke_index, 0.5)
        if stroke_index in (pole_owners["north"], pole_owners["south"]):
            pole_score = 1.0
        elif projection["horizontal_pole_candidate"] and (
            projection["band_from"] <= POLE_CLAIM_THRESHOLD * 1.35
            or projection["band_to"] >= 1.0 - POLE_CLAIM_THRESHOLD * 1.35
        ):
            pole_score = 0.5
        else:
            pole_score = 0.0
        jitter_score = _stable_unit_hash(projection["stroke_id"])
        score = min(
            1.0,
            max(
                0.0,
                ORDER_WEIGHT * order_score
                + WIDTH_WEIGHT * width_score
                + COVERAGE_WEIGHT * coverage_score
                + POLE_WEIGHT * pole_score
                + JITTER_WEIGHT * jitter_score,
            ),
        )
        level = MIN_LAYER_LEVEL + (MAX_LAYER_LEVEL - MIN_LAYER_LEVEL) * score
        profiles.append(
            {
                **projection,
                "level": level,
                "score": score,
                "components": {
                    "order": order_score,
                    "width": width_score,
                    "coverage": coverage_score,
                    "pole": pole_score,
                    "jitter": jitter_score,
                },
                "north_pole_owner": stroke_index == pole_owners["north"],
                "south_pole_owner": stroke_index == pole_owners["south"],
            }
        )
    return profiles


def _segment_distance(u: float, v: float, a: tuple[float, float], b: tuple[float, float]) -> float:
    """Distance in equirectangular texel units (U has twice V's pixel density)."""
    ax, ay = a
    bx, by = b
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


def _rounded_cross_section(normalized: float) -> float:
    rounded = math.sin(min(1.0, max(0.0, normalized)) * math.pi / 2.0) ** 1.35
    return SHOULDER_FLOOR + (1.0 - SHOULDER_FLOOR) * rounded


def _profile_strength(profile: dict, u: float, v: float) -> float | None:
    if profile["horizontal_band"]:
        if profile["north_pole_owner"]:
            if v > profile["band_to"]:
                return None
            edge_distance = profile["band_to"] - v
        elif profile["south_pole_owner"]:
            if v < profile["band_from"]:
                return None
            edge_distance = v - profile["band_from"]
        else:
            if not profile["band_from"] <= v <= profile["band_to"]:
                return None
            edge_distance = min(v - profile["band_from"], profile["band_to"] - v)
        shoulder = max(profile["width"] * 0.35, 1e-6)
        return profile["level"] * _rounded_cross_section(edge_distance / shoulder)

    if profile["north_pole_owner"] and v <= profile["band_to"]:
        return profile["level"]
    if profile["south_pole_owner"] and v >= profile["band_from"]:
        return profile["level"]

    points = profile["points"]
    distance = min(
        _segment_distance(u, v, points[index], points[index + 1])
        for index in range(len(points) - 1)
    )
    half_width = profile["width"] * 0.5
    if distance > half_width:
        return None
    normalized = 1.0 - distance / max(half_width, 1e-6)
    return profile["level"] * _rounded_cross_section(normalized)


def manifest_relief_sampler(manifest: dict):
    """Build one reusable spherical relief sampler for an STL export."""
    profiles = manifest_stroke_profiles(manifest)

    def sample(latitude: float, longitude: float) -> float:
        v = min(1.0, max(0.0, 0.5 - latitude / math.pi))
        u = ((longitude + math.pi) / math.tau) % 1.0
        relief = 0.0
        # Paint order is significant. Later authored strokes own overlapping
        # regions exactly as they do in the WebGL owner map, even at the same color.
        for profile in profiles:
            strength = _profile_strength(profile, u, v)
            if strength is not None:
                relief = strength
        return relief

    return sample


def manifest_relief_strength(manifest: dict, latitude: float, longitude: float) -> float:
    """Return the manifest-driven embossed-paint strength at a spherical sample."""
    return manifest_relief_sampler(manifest)(latitude, longitude)
