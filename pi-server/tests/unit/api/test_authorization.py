import pytest
from fastapi import HTTPException
from starlette.requests import Request

from app.api.auth import AuthorizationPolicy, ClientRole, PROXY_MARKER
from app.config import Settings


def request(
    host: str = "127.0.0.1",
    headers: dict[str, str] | None = None,
) -> Request:
    encoded_headers = [
        (key.lower().encode(), value.encode())
        for key, value in (headers or {}).items()
    ]
    return Request(
        {
            "type": "http",
            "http_version": "1.1",
            "method": "GET",
            "scheme": "http",
            "path": "/",
            "raw_path": b"/",
            "query_string": b"",
            "headers": encoded_headers,
            "client": (host, 12345),
            "server": ("127.0.0.1", 8000),
        }
    )


def proxy_headers(role: str, verified: str = "SUCCESS") -> dict[str, str]:
    return {
        "X-Kids-Galaxy-Proxy": PROXY_MARKER,
        "X-Kids-Galaxy-Role": role,
        "X-Kids-Galaxy-Client-Verified": verified,
    }


def secure_policy(*trusted_hosts: str) -> AuthorizationPolicy:
    return AuthorizationPolicy(
        Settings(
            authorization_enabled=True,
            trusted_role_proxy_hosts=trusted_hosts or ("127.0.0.1", "::1"),
        )
    )


def test_direct_loopback_client_is_projector():
    assert secure_policy().role_for(request()) == ClientRole.PROJECTOR


def test_verified_proxy_role_is_accepted():
    assert secure_policy().role_for(request(headers=proxy_headers("manager"))) == ClientRole.MANAGER


def test_proxy_role_without_certificate_verification_is_rejected():
    role = secure_policy().role_for(
        request(headers=proxy_headers("manager", verified="NONE"))
    )
    assert role is None


def test_unmarked_local_role_header_is_rejected():
    role = secure_policy().role_for(
        request(
            headers={
                "X-Kids-Galaxy-Role": "manager",
                "X-Kids-Galaxy-Client-Verified": "SUCCESS",
            }
        )
    )
    assert role is None


def test_remote_clients_cannot_spoof_forwarded_roles():
    role = secure_policy().role_for(
        request(
            host="10.42.0.55",
            headers=proxy_headers("manager"),
        )
    )
    assert role is None


def test_unknown_forwarded_role_is_rejected():
    role = secure_policy().role_for(request(headers=proxy_headers("superuser")))
    assert role is None


def test_manager_can_pass_manager_guard():
    policy = secure_policy()
    req = request(headers=proxy_headers("manager"))
    assert policy.require(req, ClientRole.MANAGER) == ClientRole.MANAGER


def test_kid_cannot_pass_manager_guard():
    policy = secure_policy()
    req = request(headers=proxy_headers("kid"))
    with pytest.raises(HTTPException) as error:
        policy.require(req, ClientRole.MANAGER)
    assert error.value.status_code == 403


def test_disabled_policy_preserves_existing_deployments():
    policy = AuthorizationPolicy(Settings(authorization_enabled=False))
    assert policy.require(request(host="10.42.0.55"), ClientRole.MANAGER) is None
