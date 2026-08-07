"""
Unit tests for rate limiting helpers - isolated with mocks.

Uses unittest.mock so we never touch real time or shared module state
across other suites.

Semantics:
- is_rate_limited(ip) is a pure check (does not write)
- mark_upload(ip) records a successful upload timestamp
"""

from unittest.mock import MagicMock, patch

import main
from main import RATE_LIMIT_SECONDS, get_client_ip, is_rate_limited, mark_upload


class TestGetClientIp:
    def test_returns_host_when_client_present(self):
        request = MagicMock()
        request.client.host = "10.42.0.5"
        assert get_client_ip(request) == "10.42.0.5"

    def test_returns_unknown_when_client_missing(self):
        request = MagicMock()
        request.client = None
        assert get_client_ip(request) == "unknown"


class TestIsRateLimited:
    def setup_method(self):
        main._last_upload.clear()

    def teardown_method(self):
        main._last_upload.clear()

    def test_first_request_not_limited_and_does_not_mark(self):
        with patch("main.time.time", return_value=1000.0):
            assert is_rate_limited("1.2.3.4") is False
            assert "1.2.3.4" not in main._last_upload

    def test_mark_then_within_window_is_limited(self):
        with patch("main.time.time", return_value=1000.0):
            mark_upload("1.2.3.4")
            assert main._last_upload["1.2.3.4"] == 1000.0

        with patch("main.time.time", return_value=1000.0 + RATE_LIMIT_SECONDS - 0.1):
            assert is_rate_limited("1.2.3.4") is True

    def test_mark_then_after_window_is_allowed(self):
        with patch("main.time.time", return_value=1000.0):
            mark_upload("1.2.3.4")

        with patch("main.time.time", return_value=1000.0 + RATE_LIMIT_SECONDS + 0.1):
            assert is_rate_limited("1.2.3.4") is False

    def test_different_ips_are_independent(self):
        with patch("main.time.time", return_value=2000.0):
            mark_upload("10.0.0.1")
            mark_upload("10.0.0.2")

        with patch("main.time.time", return_value=2000.5):
            assert is_rate_limited("10.0.0.1") is True
            assert is_rate_limited("10.0.0.2") is True
            assert is_rate_limited("10.0.0.3") is False
