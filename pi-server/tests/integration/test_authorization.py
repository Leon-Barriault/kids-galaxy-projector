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


def test_planet_exports_are_manager_only(tmp_path, make_png_bytes):
    """
    The /api/admin/planets/{id}/... exports hand back a child's artwork sized
    for print and for a 3D printer. They shipped with no `dependencies` at all,
    so anyone who could reach the port could pull them with a guessed id while
    every neighbouring route was locked down.

    Projector clients are covered too: the projector pushes its render up, it
    has no reason to pull print sheets back down.
    """
    client = secure_client(tmp_path)
    upload = client.post(
        "/api/upload",
        headers=headers("kid"),
        files={"file": ("planet.png", make_png_bytes(), "image/png")},
        data={"name": "Private World"},
    )
    planet_id = upload.json()["planet_id"]
    exports = (
        f"/api/admin/planets/{planet_id}/preview.png",
        f"/api/admin/planets/{planet_id}/print.png",
        f"/api/admin/planets/{planet_id}/print.pdf",
        f"/api/admin/planets/{planet_id}/model.stl",
    )

    for url in exports:
        # No role header at all: the direct-trusted-client projector identity.
        assert client.get(url).status_code == 403, url
        assert client.get(url, headers=headers("kid")).status_code == 403, url
        assert client.get(url, headers=headers("projector")).status_code == 403, url

    # A manager still gets through. print/pdf answer 409 until the projector
    # publishes its WebGL frame, which is an authorized answer, not a refusal.
    assert client.get(exports[0], headers=headers("manager")).status_code == 200
    assert client.get(exports[3], headers=headers("manager")).status_code == 200
    for url in exports[1:3]:
        assert client.get(url, headers=headers("manager")).status_code == 409, url


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
