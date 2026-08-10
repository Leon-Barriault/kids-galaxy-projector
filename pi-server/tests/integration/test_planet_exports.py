"""Integration coverage for manager-app planet exports."""

import struct


def test_print_sheet_is_public_png(client, upload_planet):
    planet = upload_planet(name="Print Me")

    response = client.get(f"/api/admin/planets/{planet['planet_id']}/print.png")

    assert response.status_code == 200
    assert response.headers["content-type"] == "image/png"
    assert response.content.startswith(b"\x89PNG\r\n\x1a\n")
    assert len(response.content) > 1_000


def test_stl_export_is_structurally_valid(client, upload_planet):
    planet = upload_planet(name="Model Me")

    response = client.get(
        f"/api/admin/planets/{planet['planet_id']}/model.stl",
        params={"diameter_mm": 80.0},
    )

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/sla")
    assert len(response.content) >= 84
    triangle_count = struct.unpack_from("<I", response.content, 80)[0]
    assert triangle_count > 100
    assert len(response.content) == 84 + triangle_count * 50


def test_export_rejects_unknown_planet(client):
    print_response = client.get("/api/admin/planets/missing/print.png")
    stl_response = client.get("/api/admin/planets/missing/model.stl")

    assert print_response.status_code == 404
    assert stl_response.status_code == 404


def test_stl_diameter_is_bounded_by_api(client, upload_planet):
    planet = upload_planet(name="Sized Model")
    url = f"/api/admin/planets/{planet['planet_id']}/model.stl"

    too_small = client.get(url, params={"diameter_mm": 20.0})
    too_large = client.get(url, params={"diameter_mm": 250.0})

    assert too_small.status_code == 422
    assert too_large.status_code == 422
