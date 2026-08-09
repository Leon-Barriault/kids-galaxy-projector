from fastapi.testclient import TestClient

from app.api.auth import PROXY_MARKER
from app.config import Settings
from app.factory import create_app


def app_settings(tmp_path, **overrides):
    values = {
        "upload_dir": tmp_path / "uploads",
        "state_dir": tmp_path / "state",
        "static_dir": tmp_path / "static",
        "rate_limit_seconds": 0.0,
    }
    values.update(overrides)
    return Settings(**values)


def manager_headers():
    return {
        "X-Kids-Galaxy-Proxy": PROXY_MARKER,
        "X-Kids-Galaxy-Client-Verified": "SUCCESS",
        "X-Kids-Galaxy-Role": "manager",
    }


def kid_headers():
    return {
        "X-Kids-Galaxy-Proxy": PROXY_MARKER,
        "X-Kids-Galaxy-Client-Verified": "SUCCESS",
        "X-Kids-Galaxy-Role": "kid",
    }


def test_default_behavior_is_auto_and_safe(tmp_path):
    client = TestClient(create_app(app_settings(tmp_path)))

    body = client.get("/api/behavior").json()

    assert body["settings"] == {
        "mode": "auto",
        "manual_theme": "default",
        "planet_speed": 1.0,
        "ambient_effects": True,
        "projector_language": "en",
    }
    assert body["effective"]["mode"] == "auto"
    assert body["effective"]["planet_speed"] == 1.0
    assert body["effective"]["projector_language"] == "en"


def test_manager_can_set_a_manual_theme_motion_and_projector_language(tmp_path):
    client = TestClient(create_app(app_settings(tmp_path)))

    response = client.put(
        "/api/behavior",
        json={
            "mode": "manual",
            "manual_theme": "halloween",
            "planet_speed": 1.5,
            "ambient_effects": False,
            "projector_language": "fr",
        },
    )

    assert response.status_code == 200
    assert response.json()["effective"] == {
        "theme": "halloween",
        "planet_speed": 1.5,
        "ambient_effects": False,
        "mode": "manual",
        "projector_language": "fr",
    }


def test_behavior_settings_survive_app_recreation(tmp_path):
    settings = app_settings(tmp_path)
    first = TestClient(create_app(settings))
    first.put(
        "/api/behavior",
        json={
            "mode": "manual",
            "manual_theme": "christmas",
            "planet_speed": 0.75,
            "ambient_effects": True,
            "projector_language": "fr",
        },
    )

    second = TestClient(create_app(settings))
    body = second.get("/api/behavior").json()

    assert body["settings"]["manual_theme"] == "christmas"
    assert body["settings"]["projector_language"] == "fr"
    assert body["effective"]["theme"] == "christmas"
    assert body["effective"]["planet_speed"] == 0.75
    assert body["effective"]["projector_language"] == "fr"


def test_out_of_range_planet_speed_is_rejected_by_http_contract(tmp_path):
    client = TestClient(create_app(app_settings(tmp_path)))

    response = client.put(
        "/api/behavior",
        json={"mode": "manual", "manual_theme": "default", "planet_speed": 9},
    )

    assert response.status_code == 422


def test_unknown_projector_language_is_rejected_by_http_contract(tmp_path):
    client = TestClient(create_app(app_settings(tmp_path)))

    response = client.put(
        "/api/behavior",
        json={"projector_language": "es"},
    )

    assert response.status_code == 422


def test_secure_mode_requires_manager_to_update_behavior(tmp_path):
    settings = app_settings(
        tmp_path,
        authorization_enabled=True,
        trusted_role_proxy_hosts=("testclient",),
    )
    client = TestClient(create_app(settings))
    payload = {
        "mode": "manual",
        "manual_theme": "easter",
        "planet_speed": 1.0,
        "ambient_effects": True,
        "projector_language": "fr",
    }

    assert client.put("/api/behavior", json=payload, headers=kid_headers()).status_code == 403
    assert client.put("/api/behavior", json=payload, headers=manager_headers()).status_code == 200
