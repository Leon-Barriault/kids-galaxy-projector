from fastapi.testclient import TestClient

from app.config import Settings
from app.factory import create_app


def test_scene_is_empty_before_any_upload(tmp_path):
    app = create_app(Settings(upload_dir=tmp_path / "uploads", static_dir=tmp_path / "static"))
    client = TestClient(app)

    response = client.get("/api/scene")

    assert response.status_code == 200
    assert response.json() == {"planets": []}


def test_scene_returns_the_projector_snapshot(tmp_path, make_png_bytes):
    app = create_app(
        Settings(
            upload_dir=tmp_path / "uploads",
            static_dir=tmp_path / "static",
            rate_limit_seconds=0.0,
        )
    )
    client = TestClient(app)

    for name in ("First", "Second"):
        uploaded = client.post(
            "/api/upload",
            files={"file": ("planet.png", make_png_bytes(), "image/png")},
            data={"name": name},
        )
        assert uploaded.status_code == 200

    response = client.get("/api/scene")

    assert response.status_code == 200
    body = response.json()
    assert [planet["name"] for planet in body["planets"]] == ["Second", "First"]
    assert all(planet["has_planet"] is True for planet in body["planets"])
