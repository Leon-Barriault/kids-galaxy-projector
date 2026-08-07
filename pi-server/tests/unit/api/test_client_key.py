"""
API layer: client identification.

This is the key the rate limiter throttles on, so it must degrade safely when
Starlette cannot determine a peer address (which happens behind some proxies and
in synthetic requests). Carried forward from the original get_client_ip tests.
"""

from unittest.mock import MagicMock

from app.api.routes import client_key


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
