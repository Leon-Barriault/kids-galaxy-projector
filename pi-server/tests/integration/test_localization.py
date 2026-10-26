"""Accept-Language selects the server message catalog."""

import io

from PIL import Image


def _png() -> bytes:
    image = Image.new("RGB", (32, 32), (255, 255, 255))
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def test_default_requests_keep_english_validation_text(client):
    response = client.post(
        "/api/upload",
        files={"file": ("notes.txt", b"not-an-image", "text/plain")},
        data={"name": "Nope"},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Only PNG and JPEG images are allowed."


def test_french_accept_language_localizes_validation_text(client):
    response = client.post(
        "/api/upload",
        files={"file": ("notes.txt", b"not-an-image", "text/plain")},
        data={"name": "Nope"},
        headers={"Accept-Language": "fr-CA,fr;q=0.9"},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Seules les images PNG et JPEG sont acceptées."


def test_upload_success_message_follows_the_tablet_language(client):
    response = client.post(
        "/api/upload",
        files={"file": ("planet.png", _png(), "image/png")},
        data={"name": "Étoile"},
        headers={"Accept-Language": "fr-CA"},
    )

    assert response.status_code == 200, response.text
    assert response.json()["message"] == "Ta planète s\u2019envole vers la galaxie\u00a0!"
