"""Integration coverage for manager-app planet exports."""

import io
import math
import struct

from PIL import Image, ImageDraw


def _designed_planet_png() -> bytes:
    image = Image.new("RGB", (256, 256), "#4FC3F7")
    draw = ImageDraw.Draw(image)
    draw.line((55, 70, 205, 185), fill="#E53935", width=18)
    draw.ellipse((100, 90, 145, 135), outline="#FFFFFF", width=9)
    output = io.BytesIO()
    image.save(output, format="PNG")
    return output.getvalue()


def _projector_snapshot_png(*, ringed: bool = False) -> bytes:
    """Distinctive stand-in for a PNG already rendered by the projector browser."""
    image = Image.new("RGBA", (700, 700), "#050818")
    draw = ImageDraw.Draw(image)
    if ringed:
        # Draw a broad unmistakable ring behind/in front of the body. The export
        # layer must preserve these projector pixels rather than reconstruct it.
        draw.ellipse((60, 205, 640, 495), outline="#F4C95D", width=26)
    draw.ellipse((180, 180, 520, 520), fill="#4FC3F7", outline="#9BE4FF", width=8)
    draw.line((220, 250, 470, 440), fill="#E53935", width=28)
    if ringed:
        draw.arc((60, 205, 640, 495), 0, 180, fill="#F4C95D", width=26)
    # Marker proves the exact WebGL image, not a visual approximation, was used.
    draw.rectangle((18, 18, 58, 58), fill="#00FF7F")
    output = io.BytesIO()
    image.save(output, format="PNG")
    return output.getvalue()


def _upload_designed_planet(
    client,
    name="Mapped Planet",
    style="classic",
    ring_color="#F4C95D",
):
    response = client.post(
        "/api/upload",
        files={"file": ("planet.png", _designed_planet_png(), "image/png")},
        data={
            "name": name,
            "style": style,
            "body_color": "#4FC3F7",
            "ring_color": ring_color,
        },
    )
    assert response.status_code == 200, response.text
    return response.json()


def _store_projector_snapshot(client, planet_id: str, *, ringed: bool = False) -> bytes:
    content = _projector_snapshot_png(ringed=ringed)
    response = client.put(
        f"/api/admin/planets/{planet_id}/rendered-preview.png",
        content=content,
        headers={"Content-Type": "image/png"},
    )
    assert response.status_code == 200, response.text
    assert response.json()["source"] == "projector-webgl"
    return content


def test_server_preview_falls_back_until_projector_snapshot_arrives(client):
    planet = _upload_designed_planet(client)
    url = f"/api/admin/planets/{planet['planet_id']}/preview.png"

    fallback = client.get(url)

    assert fallback.status_code == 200
    assert fallback.headers["content-type"] == "image/png"
    assert fallback.headers["x-kids-galaxy-render-source"] == "fallback"
    assert fallback.content.startswith(b"\x89PNG\r\n\x1a\n")

    snapshot = _store_projector_snapshot(client, planet["planet_id"])
    authoritative = client.get(url)

    assert authoritative.status_code == 200
    assert authoritative.headers["x-kids-galaxy-render-source"] == "webgl"
    assert authoritative.content == snapshot


def test_print_waits_for_projector_webgl_snapshot(client, upload_planet):
    planet = upload_planet(name="Print Me")
    url = f"/api/admin/planets/{planet['planet_id']}/print.png"

    not_ready = client.get(url)

    assert not_ready.status_code == 409
    assert "WebGL render is not ready" in not_ready.json()["detail"]

    _store_projector_snapshot(client, planet["planet_id"])
    response = client.get(url)

    assert response.status_code == 200
    assert response.headers["content-type"] == "image/png"
    assert response.headers["x-kids-galaxy-render-source"] == "webgl"
    assert response.content.startswith(b"\x89PNG\r\n\x1a\n")
    assert len(response.content) > 1_000


def test_ringed_print_preserves_projector_render_including_ring(client):
    planet = _upload_designed_planet(
        client,
        name="Ring Hero",
        style="ringed",
        ring_color="#F4C95D",
    )
    _store_projector_snapshot(client, planet["planet_id"], ringed=True)

    response = client.get(f"/api/admin/planets/{planet['planet_id']}/print.png")

    assert response.status_code == 200
    sheet = Image.open(io.BytesIO(response.content)).convert("RGB")
    # Hero starts at (60,145), so this marker is at the exact location it had
    # in the uploaded 700x700 WebGL frame. If Pillow re-renders the planet, it
    # disappears and the contract fails.
    assert sheet.getpixel((60 + 30, 145 + 30)) == (0, 255, 127)
    # The real ring pixels are preserved in the hero panel as well.
    assert sheet.getpixel((60 + 350, 145 + 205)) == (244, 201, 93)


def test_print_sheet_is_available_as_server_pdf(client):
    planet = _upload_designed_planet(client, name="Print PDF")
    _store_projector_snapshot(client, planet["planet_id"])

    response = client.get(f"/api/admin/planets/{planet['planet_id']}/print.pdf")

    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    assert response.headers["x-kids-galaxy-render-source"] == "webgl"
    assert response.content.startswith(b"%PDF")
    assert len(response.content) > 2_000


def test_projector_snapshot_rejects_invalid_dimensions(client):
    planet = _upload_designed_planet(client, name="Bad Snapshot")
    small = io.BytesIO()
    Image.new("RGB", (64, 64), "red").save(small, format="PNG")

    response = client.put(
        f"/api/admin/planets/{planet['planet_id']}/rendered-preview.png",
        content=small.getvalue(),
        headers={"Content-Type": "image/png"},
    )

    assert response.status_code == 400
    assert "700x700" in response.json()["detail"]


def test_stl_export_is_spherical_lithophane(client):
    planet = _upload_designed_planet(client, name="Lithophane")

    response = client.get(
        f"/api/admin/planets/{planet['planet_id']}/model.stl",
        params={"diameter_mm": 80.0},
    )

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/sla")
    assert b"spherical lithophane" in response.content[:80]
    assert len(response.content) >= 84
    triangle_count = struct.unpack_from("<I", response.content, 80)[0]
    assert triangle_count > 1_000
    assert len(response.content) == 84 + triangle_count * 50

    radii = []
    minimum_y = math.inf
    maximum_y = -math.inf
    for triangle in range(triangle_count):
        offset = 84 + triangle * 50 + 12
        values = struct.unpack_from("<9f", response.content, offset)
        for vertex in range(3):
            x, y, z = values[vertex * 3 : vertex * 3 + 3]
            radii.append(math.sqrt(x * x + y * y + z * z))
            minimum_y = min(minimum_y, y)
            maximum_y = max(maximum_y, y)

    # 80 mm is the maximum outside diameter. The constant inner surface and
    # variable outer wall prove this is a hollow thickness lithophane rather
    # than the old single radial relief sphere.
    assert max(radii) <= 40.01
    assert min(radii) < 37.0
    assert max(radii) - min(radii) > 2.5
    # The south pole is intentionally omitted to make the hollow globe printable.
    assert minimum_y > -38.5
    assert maximum_y > 37.5


def test_export_rejects_unknown_planet(client):
    preview_response = client.get("/api/admin/planets/missing/preview.png")
    print_response = client.get("/api/admin/planets/missing/print.png")
    pdf_response = client.get("/api/admin/planets/missing/print.pdf")
    stl_response = client.get("/api/admin/planets/missing/model.stl")
    snapshot_response = client.put(
        "/api/admin/planets/missing/rendered-preview.png",
        content=_projector_snapshot_png(),
        headers={"Content-Type": "image/png"},
    )

    assert preview_response.status_code == 404
    assert print_response.status_code == 404
    assert pdf_response.status_code == 404
    assert stl_response.status_code == 404
    assert snapshot_response.status_code == 404


def test_stl_diameter_is_bounded_by_api(client, upload_planet):
    planet = upload_planet(name="Sized Model")
    url = f"/api/admin/planets/{planet['planet_id']}/model.stl"

    too_small = client.get(url, params={"diameter_mm": 20.0})
    too_large = client.get(url, params={"diameter_mm": 250.0})

    assert too_small.status_code == 422
    assert too_large.status_code == 422
