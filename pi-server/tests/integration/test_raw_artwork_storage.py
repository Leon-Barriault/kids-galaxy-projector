"""Product contract: storage preserves the child's drawing for the projector."""

import io

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.config import Settings
from app.factory import create_app


def _sparse_drawing() -> bytes:
    image = Image.new("RGB", (256, 256), (255, 255, 255))
    for y in range(92, 142):
        for x in range(96, 166):
            image.putpixel((x, y), (33, 150, 243))
    for y in range(126, 164):
        for x in range(136, 188):
            image.putpixel((x, y), (76, 175, 80))
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def _upload_and_read(client: TestClient, png: bytes) -> Image.Image:
    response = client.post(
        "/api/upload",
        files={"file": ("kid-drawing.png", png, "image/png")},
        data={"name": "Raw Kid Drawing"},
    )
    assert response.status_code == 200, response.text
    stored = client.get(response.json()["url"])
    assert stored.status_code == 200
    return Image.open(io.BytesIO(stored.content)).convert("RGB")


def _white_fraction(image: Image.Image) -> float:
    pixels = list(image.convert("L").getdata())
    return sum(1 for value in pixels if value >= 238) / len(pixels)


def test_default_storage_preserves_sparse_child_composition(client):
    stored = _upload_and_read(client, _sparse_drawing())

    # White means "the child did not paint here". Keeping that information is
    # what allows the projector to distinguish body colour from raised motifs.
    assert _white_fraction(stored) > 0.75
    assert stored.getpixel((110, 105))[2] > stored.getpixel((110, 105))[0]
    assert stored.getpixel((165, 145))[1] > stored.getpixel((165, 145))[0]


@pytest.mark.parametrize("legacy_style", ["terrain", "blend"])
def test_legacy_surface_style_env_cannot_destroy_the_kid_drawing(
    tmp_path,
    legacy_style,
):
    settings = Settings(
        upload_dir=tmp_path / "uploads",
        static_dir=tmp_path / "static",
        rate_limit_seconds=0.0,
        advertise=False,
        surface_style=legacy_style,
    )
    stored = _upload_and_read(TestClient(create_app(settings)), _sparse_drawing())

    assert _white_fraction(stored) > 0.75
