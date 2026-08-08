import pytest
from fastapi import HTTPException
from starlette.requests import Request

from app.api.auth import AuthorizationPolicy, ClientRole
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
    role = secure_policy().role_for(
        request(
            headers={
                "X-Kids-Galaxy-Role": "manager",
                "X-Kids-Galaxy-Client-Verified": "SUCCESS",
            }
        )
    )
    assert role == ClientRole.MANAGER


def test_role_header_without_certificate_verification_is_rejected():
    role = secure_policy().role_for(
        request(headers={"X-Kids-Galaxy-Role": "manager"})
    )
    assert role is None


def test_remote_clients_cannot_spoof_forwarded_roles():
    role = secure_policy().role_for(
        request(
            host="10.42.0.55",
            headers={
                "X-Kids-Galaxy-Role": "manager",
                "X-Kids-Galaxy-Client-Verified": "SUCCESS",
            },
        )
    )
    assert role is None


def test_unknown_forwarded_role_is_rejected():
    role = secure_policy().role_for(
        request(
            headers={
                "X-Kids-Galaxy-Role": "superuser",
                "X-Kids-Galaxy-Client-Verified": "SUCCESS",
            }
        )
    )
    assert role is None


def test_manager_can_pass_manager_guard():
    policy = secure_policy()
    req = request(
        headers={
            "X-Kids-Galaxy-Role": "manager",
            "X-Kids-Galaxy-Client-Verified": "SUCCESS",
        }
    )
    assert policy.require(req, ClientRole.MANAGER) == ClientRole.MANAGER


def test_kid_cannot_pass_manager_guard():
    policy = secure_policy()
    req = request(
        headers={
            "X-Kids-Galaxy-Role": "kid",
            "X-Kids-Galaxy-Client-Verified": "SUCCESS",
        }
    )
    with pytest.raises(HTTPException) as error:
        policy.require(req, ClientRole.MANAGER)
    assert error.value.status_code == 403


def test_disabled_policy_preserves_existing_deployments():
    policy = AuthorizationPolicy(Settings(authorization_enabled=False))
    assert policy.require(request(host="10.42.0.55"), ClientRole.MANAGER) is None
