"""Validation for the vector drawing sidecar produced by the kid tablet."""

from __future__ import annotations

import json
import math
import re

from app.domain.errors import ValidationError

DRAWING_MANIFEST_VERSION = 1
MAX_MANIFEST_BYTES = 1024 * 1024
MAX_STROKES = 512
MAX_POINTS_PER_STROKE = 8192
MAX_TOTAL_POINTS = 32768
MAX_CANVAS_DIMENSION = 8192.0
RGB_HEX = re.compile(r"^#[0-9a-fA-F]{6}$")
STROKE_ID = re.compile(r"^[A-Za-z0-9._:-]{1,64}$")


def _number(value, *, field: str, minimum: float, maximum: float) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValidationError(f"Invalid drawing manifest {field}.")
    number = float(value)
    if not math.isfinite(number) or number < minimum or number > maximum:
        raise ValidationError(f"Invalid drawing manifest {field}.")
    return number


def _colour(value, *, field: str) -> str:
    if not isinstance(value, str) or not RGB_HEX.fullmatch(value.strip()):
        raise ValidationError(f"Invalid drawing manifest {field}.")
    return value.strip().lower()


def _stroke_id(value, *, index: int) -> str:
    if value is None:
        return f"stroke-{index:04d}"
    if not isinstance(value, str) or not STROKE_ID.fullmatch(value.strip()):
        raise ValidationError("Invalid drawing manifest stroke ID.")
    return value.strip()


def normalize_drawing_manifest(raw: bytes | None) -> dict | None:
    """Parse and canonicalise the tablet-authored drawing manifest."""
    if raw is None:
        return None
    if not raw or len(raw) > MAX_MANIFEST_BYTES:
        raise ValidationError("Invalid drawing manifest size.")

    try:
        payload = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise ValidationError("Invalid drawing manifest JSON.") from error

    if not isinstance(payload, dict) or payload.get("version") != DRAWING_MANIFEST_VERSION:
        raise ValidationError("Unsupported drawing manifest version.")
    if payload.get("coordinate_space") != "normalized-canvas-v1":
        raise ValidationError("Unsupported drawing manifest coordinate space.")

    canvas = payload.get("canvas")
    if not isinstance(canvas, dict):
        raise ValidationError("Invalid drawing manifest canvas.")
    width = _number(
        canvas.get("width"),
        field="canvas width",
        minimum=1.0,
        maximum=MAX_CANVAS_DIMENSION,
    )
    height = _number(
        canvas.get("height"),
        field="canvas height",
        minimum=1.0,
        maximum=MAX_CANVAS_DIMENSION,
    )

    background = _colour(payload.get("background_color"), field="background colour")
    background_explicit = bool(payload.get("background_explicit", False))
    strokes = payload.get("strokes")
    if not isinstance(strokes, list) or len(strokes) > MAX_STROKES:
        raise ValidationError("Invalid drawing manifest strokes.")

    normalized_strokes: list[dict] = []
    seen_stroke_ids: set[str] = set()
    total_points = 0
    for index, stroke in enumerate(strokes):
        if not isinstance(stroke, dict):
            raise ValidationError("Invalid drawing manifest stroke.")
        stroke_id = _stroke_id(stroke.get("stroke_id"), index=index)
        if stroke_id in seen_stroke_ids:
            raise ValidationError("Drawing manifest stroke IDs must be unique.")
        seen_stroke_ids.add(stroke_id)

        colour = _colour(stroke.get("color"), field="stroke colour")
        width_px = _number(
            stroke.get("width_px"),
            field="stroke width",
            minimum=0.1,
            maximum=MAX_CANVAS_DIMENSION,
        )
        width_normalized = _number(
            stroke.get("width_normalized"),
            field="normalized stroke width",
            minimum=0.00001,
            maximum=1.0,
        )
        points = stroke.get("points")
        if not isinstance(points, list) or not 2 <= len(points) <= MAX_POINTS_PER_STROKE:
            raise ValidationError("Invalid drawing manifest stroke points.")
        total_points += len(points)
        if total_points > MAX_TOTAL_POINTS:
            raise ValidationError("Drawing manifest contains too many points.")

        normalized_points: list[list[float]] = []
        for point in points:
            if not isinstance(point, list) or len(point) != 2:
                raise ValidationError("Invalid drawing manifest point.")
            x = _number(point[0], field="point x", minimum=0.0, maximum=1.0)
            y = _number(point[1], field="point y", minimum=0.0, maximum=1.0)
            normalized_points.append([x, y])

        normalized_strokes.append(
            {
                "stroke_id": stroke_id,
                "order": index,
                "color": colour,
                "width_px": width_px,
                "width_normalized": width_normalized,
                "points": normalized_points,
            }
        )

    return {
        "version": DRAWING_MANIFEST_VERSION,
        "coordinate_space": "normalized-canvas-v1",
        "canvas": {"width": width, "height": height},
        "background_color": background,
        "background_explicit": background_explicit,
        "strokes": normalized_strokes,
        "raster": {
            "background_fill": "solid",
            "stroke_cap": "round",
            "stroke_join": "round",
            "stroke_order": "oldest-to-newest",
        },
    }
