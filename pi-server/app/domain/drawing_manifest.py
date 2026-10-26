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


def _number(value, *, field_key: str, minimum: float, maximum: float) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValidationError(message_key="invalid_manifest_field", field_key=field_key)
    number = float(value)
    if not math.isfinite(number) or number < minimum or number > maximum:
        raise ValidationError(message_key="invalid_manifest_field", field_key=field_key)
    return number


def _colour(value, *, field_key: str) -> str:
    if not isinstance(value, str) or not RGB_HEX.fullmatch(value.strip()):
        raise ValidationError(message_key="invalid_manifest_field", field_key=field_key)
    return value.strip().lower()


def _stroke_id(value, *, index: int) -> str:
    if value is None:
        return f"stroke-{index:04d}"
    if not isinstance(value, str) or not STROKE_ID.fullmatch(value.strip()):
        raise ValidationError(message_key="invalid_manifest_stroke_id")
    return value.strip()


def normalize_drawing_manifest(raw: bytes | None) -> dict | None:
    """Parse and canonicalise the tablet-authored drawing manifest."""
    if raw is None:
        return None
    if not raw or len(raw) > MAX_MANIFEST_BYTES:
        raise ValidationError(message_key="invalid_manifest_size")

    try:
        payload = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise ValidationError(message_key="invalid_manifest_json") from error

    if not isinstance(payload, dict) or payload.get("version") != DRAWING_MANIFEST_VERSION:
        raise ValidationError(message_key="unsupported_manifest_version")
    if payload.get("coordinate_space") != "normalized-canvas-v1":
        raise ValidationError(message_key="unsupported_manifest_coordinate_space")

    canvas = payload.get("canvas")
    if not isinstance(canvas, dict):
        raise ValidationError(message_key="invalid_manifest_canvas")
    width = _number(
        canvas.get("width"),
        field_key="field_canvas_width",
        minimum=1.0,
        maximum=MAX_CANVAS_DIMENSION,
    )
    height = _number(
        canvas.get("height"),
        field_key="field_canvas_height",
        minimum=1.0,
        maximum=MAX_CANVAS_DIMENSION,
    )

    background = _colour(payload.get("background_color"), field_key="field_background_colour")
    background_explicit = bool(payload.get("background_explicit", False))
    strokes = payload.get("strokes")
    if not isinstance(strokes, list) or len(strokes) > MAX_STROKES:
        raise ValidationError(message_key="invalid_manifest_strokes")

    normalized_strokes: list[dict] = []
    seen_stroke_ids: set[str] = set()
    total_points = 0
    for index, stroke in enumerate(strokes):
        if not isinstance(stroke, dict):
            raise ValidationError(message_key="invalid_manifest_stroke")
        stroke_id = _stroke_id(stroke.get("stroke_id"), index=index)
        if stroke_id in seen_stroke_ids:
            raise ValidationError(message_key="duplicate_stroke_ids")
        seen_stroke_ids.add(stroke_id)

        colour = _colour(stroke.get("color"), field_key="field_stroke_colour")
        width_px = _number(
            stroke.get("width_px"),
            field_key="field_stroke_width",
            minimum=0.1,
            maximum=MAX_CANVAS_DIMENSION,
        )
        width_normalized = _number(
            stroke.get("width_normalized"),
            field_key="field_normalized_stroke_width",
            minimum=0.00001,
            maximum=1.0,
        )
        points = stroke.get("points")
        if not isinstance(points, list) or not 2 <= len(points) <= MAX_POINTS_PER_STROKE:
            raise ValidationError(message_key="invalid_manifest_points")
        total_points += len(points)
        if total_points > MAX_TOTAL_POINTS:
            raise ValidationError(message_key="too_many_points")

        normalized_points: list[list[float]] = []
        for point in points:
            if not isinstance(point, list) or len(point) != 2:
                raise ValidationError(message_key="invalid_manifest_point")
            x = _number(point[0], field_key="field_point_x", minimum=0.0, maximum=1.0)
            y = _number(point[1], field_key="field_point_y", minimum=0.0, maximum=1.0)
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
