"""
API layer: client identification.

This is the key the rate limiter throttles on, so it must degrade safely when
Starlette cannot determine a peer address (which happens behind some proxies and
in synthetic requests). Carried forward from the original get_client_ip tests.
"""

from unittest.mock import MagicMock

from app.api.auth import (
    CLIENT_ID_HEADER,
    PROXY_HEADER,
    PROXY_MARKER,
    AuthorizationPolicy,
)
from app.api.routes import client_key
from app.config import Settings

GATEWAY_HOST = "127.0.0.1"


def gateway_policy() -> AuthorizationPolicy:
    return AuthorizationPolicy(
        Settings(
            authorization_enabled=True,
            trusted_role_proxy_hosts=(GATEWAY_HOST,),
        )
    )


def proxied_request(serial: str | None, *, host: str = GATEWAY_HOST, marker=PROXY_MARKER):
    headers = {}
    if marker is not None:
        headers[PROXY_HEADER] = marker
    if serial is not None:
        headers[CLIENT_ID_HEADER] = serial
    request = MagicMock()
    request.client.host = host
    request.headers = headers
    return request


class TestClientKey:
    def test_returns_host_when_client_present(self):
        request = MagicMock()
        request.client.host = "10.42.0.5"
        assert client_key(request) == "10.42.0.5"

    def test_returns_unknown_when_client_missing(self):
        request = MagicMock()
        request.client = None
        assert client_key(request) == "unknown"

    def test_distinct_hosts_give_distinct_keys(self):
        """Two tablets must not share a cooldown."""
        first, second = MagicMock(), MagicMock()
        first.client.host = "10.42.0.5"
        second.client.host = "10.42.0.6"
        assert client_key(first) != client_key(second)


class TestClientKeyBehindTheGateway:
    """
    Regression: in secure field mode every tablet reaches FastAPI from the
    gateway's loopback address, so the peer-address key collapsed the whole
    classroom into a single cooldown bucket. One kid sending a planet gave
    everyone else a 429, which reads as the app being broken rather than as
    rate limiting.
    """

    def test_two_certificates_behind_one_proxy_do_not_share_a_cooldown(self):
        policy = gateway_policy()

        first = client_key(proxied_request("4A2B"), policy)
        second = client_key(proxied_request("9F10"), policy)

        assert first != second
        assert first != GATEWAY_HOST and second != GATEWAY_HOST

    def test_same_certificate_keeps_one_cooldown(self):
        policy = gateway_policy()
        assert client_key(proxied_request("4A2B"), policy) == client_key(
            proxied_request("4A2B"), policy
        )

    def test_anonymous_client_falls_back_to_the_shared_peer_bucket(self):
        """
        Certificates are optional at the edge. Sharing a bucket is the safe
        direction to fail: restrictive, never a way around the limit.
        """
        policy = gateway_policy()
        for serial in (None, "", "   "):
            assert client_key(proxied_request(serial), policy) == GATEWAY_HOST

    def test_untrusted_peer_cannot_mint_its_own_key(self):
        """Otherwise any client escapes its cooldown by varying one header."""
        policy = gateway_policy()
        spoofed = proxied_request("4A2B", host="10.42.0.5")

        assert client_key(spoofed, policy) == "10.42.0.5"

    def test_trusted_peer_without_the_gateway_marker_is_not_believed(self):
        """A local process must not self-identify as an arbitrary tablet."""
        policy = gateway_policy()
        unmarked = proxied_request("4A2B", marker=None)

        assert client_key(unmarked, policy) == GATEWAY_HOST

    def test_forwarded_identity_is_length_capped(self):
        policy = gateway_policy()
        key = client_key(proxied_request("A" * 4096), policy)

        assert len(key) <= 140
