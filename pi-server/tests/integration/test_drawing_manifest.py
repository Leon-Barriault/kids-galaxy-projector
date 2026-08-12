"""End-to-end contract for kid-tablet vector drawing sidecars."""

import io
import json

from fastapi.testclient import TestClient
from PIL import Image


def _png() -> bytes:
    image = Image.new("RGB", (128, 128), (255, 255, 255))
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def _manifest(background: str = "#ffffff") -> bytes:
    return json.dumps(
        {
            "version": 1,
            "coordinate_space": "normalized-canvas-v1",
            "canvas": {"width": 128, "height": 128},
            "background_color": background,
            "background_explicit": True,
            "strokes": [
                {
                    "order": 0,
                    "color": "#7b1fa2",
                    "width_px": 18,
                    "width_normalized": 0.140625,
                    "points": [[0.08, 0.12], [0.5, 0.1], [0.92, 0.14]],
                },
                {
                    "order": 1,
                    "color": "#43a047",
                    "width_px": 14,
                    "width_normalized": 0.109375,
                    "points": [[0.48, 0.25], [0.52, 0.55], [0.5, 0.92]],
                },
            ],
            "raster": {
                "background_fill": "solid",
                "stroke_cap": "round",
                "stroke_join": "round",
                "stroke_order": "oldest-to-newest",
            },
        }
    ).encode()


def test_manifest_is_required_for_every_new_planet(raw_client: TestClient):
    response = raw_client.post(
        "/api/upload",
        files={"file": ("planet.png", _png(), "image/png")},
        data={"name": "Image Only"},
    )
    assert response.status_code == 422
    assert any(error.get("loc", [])[-1:] == ["manifest"] for error in response.json()["detail"])


def test_manifest_is_stored_and_exposed_with_planet_payload(client: TestClient):
    response = client.post(
        "/api/upload",
        files={
            "file": ("planet.png", _png(), "image/png"),
            "manifest": ("drawing-manifest.json", _manifest(), "application/json"),
        },
        data={"name": "Manifest Planet", "body_color": "#ffffff"},
    )
    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["body_color"] == "#ffffff"
    assert payload["drawing_manifest_url"].endswith(".drawing.json")

    stored = client.get(payload["drawing_manifest_url"])
    assert stored.status_code == 200
    canonical = stored.json()
    assert canonical["background_color"] == "#ffffff"
    assert [stroke["color"] for stroke in canonical["strokes"]] == ["#7b1fa2", "#43a047"]
    assert canonical["strokes"][0]["points"][0] == [0.08, 0.12]

    gallery = client.get("/api/planets?limit=12").json()["planets"]
    planet = next(item for item in gallery if item["id"] == payload["planet_id"])
    assert planet["drawing_manifest_url"] == payload["drawing_manifest_url"]


def test_manifest_background_must_match_body_color_field(client: TestClient):
    response = client.post(
        "/api/upload",
        files={
            "file": ("planet.png", _png(), "image/png"),
            "manifest": ("drawing-manifest.json", _manifest("#112233"), "application/json"),
        },
        data={"name": "Mismatch", "body_color": "#ffffff"},
    )
    assert response.status_code == 400
    assert "background" in response.json()["detail"].lower()
