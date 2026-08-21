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
        "region": "ca-qc",
        "planet_speed": 1.0,
        "ambient_effects": True,
        "projector_language": "en",
        "asteroid_belt_enabled": False,
        "comets_enabled": False,
        "comet_frequency": "normal",
        "flyby_asteroids_enabled": False,
        "flyby_frequency": "normal",
        "enabled_themes": [
            "default",
            "halloween",
            "easter",
            "christmas",
            "remembrance-day",
            "canada-day",
            "fete-nationale",
            "thanksgiving",
            "new-year",
            "family-day",
        ],
    }
    assert body["effective"]["mode"] == "auto"
    assert body["effective"]["planet_speed"] == 1.0
    assert body["effective"]["projector_language"] == "en"
    assert body["effective"]["asteroid_belt_enabled"] is False
    assert body["effective"]["comets_enabled"] is False
    assert body["effective"]["flyby_asteroids_enabled"] is False


def test_manager_can_configure_theme_region_motion_language_and_space_activity(tmp_path):
    client = TestClient(create_app(app_settings(tmp_path)))

    response = client.put(
        "/api/behavior",
        json={
            "mode": "manual",
            "manual_theme": "halloween",
            "region": "ca-on",
            "planet_speed": 1.5,
            "ambient_effects": False,
            "projector_language": "fr",
            "asteroid_belt_enabled": True,
            "comets_enabled": True,
            "comet_frequency": "frequent",
            "flyby_asteroids_enabled": True,
            "flyby_frequency": "rare",
            "enabled_themes": ["default", "halloween", "easter"],
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["settings"]["region"] == "ca-on"
    assert body["effective"] == {
        "theme": "halloween",
        "planet_speed": 1.5,
        "ambient_effects": False,
        "mode": "manual",
        "projector_language": "fr",
        "asteroid_belt_enabled": True,
        "comets_enabled": True,
        "comet_frequency": "frequent",
        "flyby_asteroids_enabled": True,
        "flyby_frequency": "rare",
    }


def test_manager_can_select_every_new_theme_manually(tmp_path):
    client = TestClient(create_app(app_settings(tmp_path)))

    for theme in (
        "remembrance-day",
        "canada-day",
        "fete-nationale",
        "thanksgiving",
        "new-year",
        "family-day",
    ):
        response = client.put(
            "/api/behavior",
            json={
                "mode": "manual",
                "manual_theme": theme,
                "enabled_themes": ["default", theme],
            },
        )
        assert response.status_code == 200
        assert response.json()["effective"]["theme"] == theme


def test_behavior_settings_survive_app_recreation(tmp_path):
    settings = app_settings(tmp_path)
    first = TestClient(create_app(settings))
    first.put(
        "/api/behavior",
        json={
            "mode": "manual",
            "manual_theme": "christmas",
            "region": "ca-bc",
            "planet_speed": 0.75,
            "ambient_effects": True,
            "projector_language": "fr",
            "asteroid_belt_enabled": True,
            "comets_enabled": True,
            "comet_frequency": "rare",
            "flyby_asteroids_enabled": True,
            "flyby_frequency": "frequent",
            "enabled_themes": ["default", "christmas"],
        },
    )

    second = TestClient(create_app(settings))
    body = second.get("/api/behavior").json()

    assert body["settings"]["manual_theme"] == "christmas"
    assert body["settings"]["region"] == "ca-bc"
    assert body["settings"]["projector_language"] == "fr"
    assert body["settings"]["asteroid_belt_enabled"] is True
    assert body["settings"]["comets_enabled"] is True
    assert body["settings"]["flyby_asteroids_enabled"] is True
    assert body["settings"]["enabled_themes"] == ["default", "christmas"]
    assert body["effective"]["theme"] == "christmas"
    assert body["effective"]["planet_speed"] == 0.75
    assert body["effective"]["projector_language"] == "fr"


def test_disabled_manual_theme_falls_back_to_default(tmp_path):
    client = TestClient(create_app(app_settings(tmp_path)))

    response = client.put(
        "/api/behavior",
        json={
            "mode": "manual",
            "manual_theme": "christmas",
            "enabled_themes": ["default", "halloween"],
        },
    )

    assert response.status_code == 200
    assert response.json()["effective"]["theme"] == "default"


def test_unknown_region_is_rejected_by_http_contract(tmp_path):
    client = TestClient(create_app(app_settings(tmp_path)))

    response = client.put("/api/behavior", json={"region": "ca-made-up"})

    assert response.status_code == 422


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


def test_unknown_event_frequency_is_rejected_by_http_contract(tmp_path):
    client = TestClient(create_app(app_settings(tmp_path)))

    response = client.put(
        "/api/behavior",
        json={"comets_enabled": True, "comet_frequency": "constant"},
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
        "region": "ca-qc",
        "planet_speed": 1.0,
        "ambient_effects": True,
        "projector_language": "fr",
        "asteroid_belt_enabled": True,
        "comets_enabled": True,
        "flyby_asteroids_enabled": True,
    }

    assert client.put("/api/behavior", json=payload, headers=kid_headers()).status_code == 403
    assert client.put("/api/behavior", json=payload, headers=manager_headers()).status_code == 200
