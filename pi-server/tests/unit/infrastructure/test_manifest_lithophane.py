import math

from app.infrastructure.manifest_lithophane import manifest_relief_strength


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


def test_vertical_stroke_stays_near_one_meridian():
    manifest = _manifest(
        [
            {
                "color": "#43a047",
                "width_normalized": 0.06,
                "points": [[0.5, 0.25], [0.52, 0.5], [0.49, 0.8]],
            }
        ]
    )

    authored_meridian = (0.52 * math.tau) - math.pi
    centre = manifest_relief_strength(manifest, 0.0, authored_meridian)
    opposite = manifest_relief_strength(manifest, 0.0, math.pi * 0.8)

    assert centre > 0.6
    assert opposite == 0.0


def test_pole_reaching_stroke_closes_the_north_cap():
    manifest = _manifest(
        [
            {
                "color": "#7b1fa2",
                "width_normalized": 0.09,
                "points": [[0.2, 0.04], [0.5, 0.06], [0.8, 0.04]],
            }
        ]
    )

    strengths = [
        manifest_relief_strength(manifest, math.radians(89.0), longitude)
        for longitude in (-math.pi, -1.0, 0.0, 1.0, math.pi - 0.01)
    ]

    assert strengths == [1.0] * len(strengths)
