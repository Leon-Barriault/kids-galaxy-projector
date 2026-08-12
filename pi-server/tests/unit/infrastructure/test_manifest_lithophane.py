import math

import pytest

from app.infrastructure.manifest_lithophane import (
    COVERAGE_WEIGHT,
    JITTER_WEIGHT,
    MAX_LAYER_LEVEL,
    MIN_LAYER_LEVEL,
    ORDER_WEIGHT,
    POLE_WEIGHT,
    WIDTH_WEIGHT,
    manifest_relief_strength,
    manifest_stroke_profiles,
)


def _manifest(strokes):
    return {
        "version": 1,
        "coordinate_space": "normalized-canvas-v1",
        "background_color": "#ffffff",
        "strokes": strokes,
    }


def test_horizontal_stroke_wraps_all_longitudes():
    manifest = _manifest(
        [
            {
                "stroke_id": "orange-band",
                "order": 0,
                "color": "#ff8800",
                "width_normalized": 0.08,
                "points": [[0.25, 0.4], [0.5, 0.42], [0.75, 0.4]],
            }
        ]
    )
    latitude = math.pi * (0.5 - 0.41)

    strengths = [
        manifest_relief_strength(manifest, latitude, -math.pi + index * math.tau / 24)
        for index in range(24)
    ]

    assert min(strengths) > 0.45
    assert max(strengths) - min(strengths) < 1e-6


def test_vertical_stroke_stays_near_one_meridian():
    manifest = _manifest(
        [
            {
                "stroke_id": "green-meridian",
                "order": 0,
                "color": "#43a047",
                "width_normalized": 0.06,
                "points": [[0.5, 0.25], [0.52, 0.5], [0.49, 0.8]],
            }
        ]
    )

    authored_meridian = (0.52 * math.tau) - math.pi
    centre = manifest_relief_strength(manifest, 0.0, authored_meridian)
    opposite = manifest_relief_strength(manifest, 0.0, math.pi * 0.8)

    assert centre > 0.45
    assert opposite == 0.0


def test_pole_owning_stroke_closes_the_north_cap():
    manifest = _manifest(
        [
            {
                "stroke_id": "purple-cap",
                "order": 0,
                "color": "#7b1fa2",
                "width_normalized": 0.09,
                "points": [[0.2, 0.14], [0.5, 0.16], [0.8, 0.14]],
            }
        ]
    )

    strengths = [
        manifest_relief_strength(manifest, math.radians(89.0), longitude)
        for longitude in (-math.pi, -1.0, 0.0, 1.0, math.pi - 0.01)
    ]

    assert min(strengths) > 0.65
    assert max(strengths) - min(strengths) < 1e-6


def test_same_color_strokes_receive_independent_mixed_heuristic_heights():
    manifest = _manifest(
        [
            {
                "stroke_id": "orange-wide-early",
                "order": 0,
                "color": "#ff8800",
                "width_normalized": 0.11,
                "points": [[0.1, 0.3], [0.5, 0.31], [0.9, 0.3]],
            },
            {
                "stroke_id": "orange-narrow-late",
                "order": 1,
                "color": "#ff8800",
                "width_normalized": 0.05,
                "points": [[0.25, 0.65], [0.5, 0.67], [0.75, 0.65]],
            },
        ]
    )

    profiles = manifest_stroke_profiles(manifest)

    assert [profile["color"] for profile in profiles] == ["#ff8800", "#ff8800"]
    assert [profile["stroke_id"] for profile in profiles] == [
        "orange-wide-early",
        "orange-narrow-late",
    ]
    assert profiles[0]["level"] != pytest.approx(profiles[1]["level"], abs=1e-6)
    assert profiles[0]["components"]["jitter"] != profiles[1]["components"]["jitter"]

    for profile in profiles:
        components = profile["components"]
        expected_score = (
            ORDER_WEIGHT * components["order"]
            + WIDTH_WEIGHT * components["width"]
            + COVERAGE_WEIGHT * components["coverage"]
            + POLE_WEIGHT * components["pole"]
            + JITTER_WEIGHT * components["jitter"]
        )
        expected_level = MIN_LAYER_LEVEL + (MAX_LAYER_LEVEL - MIN_LAYER_LEVEL) * expected_score
        assert profile["score"] == pytest.approx(expected_score)
        assert profile["level"] == pytest.approx(expected_level)
