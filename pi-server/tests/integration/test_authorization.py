from fastapi.testclient import TestClient

from app.api.auth import PROXY_MARKER
from app.config import Settings
from app.factory import create_app

VERIFIED = "SUCCESS"


def secure_client(tmp_path) -> TestClient:
    app = create_app(
        Settings(
            upload_dir=tmp_path / "uploads",
            static_dir=tmp_path / "static",
            rate_limit_seconds=0.0,
            authorization_enabled=True,
            # Starlette TestClient identifies itself this way. Production uses
            # only loopback addresses for the trusted reverse proxy.
            trusted_role_proxy_hosts=("testclient",),
        )
    )
    return TestClient(app)


def headers(role: str) -> dict[str, str]:
    return {
        "X-Kids-Galaxy-Proxy": PROXY_MARKER,
        "X-Kids-Galaxy-Role": role,
        "X-Kids-Galaxy-Client-Verified": VERIFIED,
    }


def test_discovery_identity_remains_public_in_secure_mode(tmp_path):
    client = secure_client(tmp_path)
    assert client.get("/api/galaxy").status_code == 200
    assert client.get("/health").status_code == 200


def test_kid_can_upload_but_cannot_delete(tmp_path, make_png_bytes):
    client = secure_client(tmp_path)
    upload = client.post(
        "/api/upload",
        headers=headers("kid"),
        files={"file": ("planet.png", make_png_bytes(), "image/png")},
        data={"name": "Kid World"},
    )
    assert upload.status_code == 200

    planet_id = upload.json()["planet_id"]
    forbidden = client.delete(
        f"/api/planets/{planet_id}",
        headers=headers("kid"),
    )
    assert forbidden.status_code == 403


def test_manager_can_list_and_delete_but_cannot_submit(tmp_path, make_png_bytes):
    client = secure_client(tmp_path)
    upload = client.post(
        "/api/upload",
        headers=headers("kid"),
        files={"file": ("planet.png", make_png_bytes(), "image/png")},
        data={"name": "Managed World"},
    )
    planet_id = upload.json()["planet_id"]

    gallery = client.get("/api/planets", headers=headers("manager"))
    assert gallery.status_code == 200
    assert gallery.json()["planets"][0]["id"] == planet_id

    deleted = client.delete(
        f"/api/planets/{planet_id}",
        headers=headers("manager"),
    )
    assert deleted.status_code == 200

    forbidden_upload = client.post(
        "/api/upload",
        headers=headers("manager"),
        files={"file": ("planet.png", make_png_bytes(), "image/png")},
        data={"name": "Manager World"},
    )
    assert forbidden_upload.status_code == 403


def test_direct_trusted_client_is_read_only_projector(tmp_path):
    client = secure_client(tmp_path)

    assert client.get("/api/scene").status_code == 200
    assert client.get("/api/planets").status_code == 200
    assert client.delete("/api/planets").status_code == 403


def test_unverified_forwarded_role_is_rejected(tmp_path):
    client = secure_client(tmp_path)
    response = client.get(
        "/api/planets",
        headers={
            "X-Kids-Galaxy-Proxy": PROXY_MARKER,
            "X-Kids-Galaxy-Role": "manager",
            "X-Kids-Galaxy-Client-Verified": "NONE",
        },
    )
    assert response.status_code == 403


def test_unmarked_forwarded_role_is_rejected(tmp_path):
    client = secure_client(tmp_path)
    response = client.get(
        "/api/planets",
        headers={
            "X-Kids-Galaxy-Role": "manager",
            "X-Kids-Galaxy-Client-Verified": VERIFIED,
        },
    )
    assert response.status_code == 403
