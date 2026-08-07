"""
Unit tests for rate limiting helpers – isolated with mocks.

Uses unittest.mock so we never touch real time or shared module state
across other suites.
"""

from unittest.mock import MagicMock, patch

import main
from main import get_client_ip, is_rate_limited, RATE_LIMIT_SECONDS


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
        # Isolate: start each test with a clean rate-limit map
        main._last_upload.clear()

    def teardown_method(self):
        main._last_upload.clear()

    def test_first_request_not_limited(self):
        with patch("main.time.time", return_value=1000.0):
            assert is_rate_limited("1.2.3.4") is False
            assert main._last_upload["1.2.3.4"] == 1000.0

    def test_second_request_within_window_is_limited(self):
        with patch("main.time.time", return_value=1000.0):
            is_rate_limited("1.2.3.4")

        # Still inside RATE_LIMIT_SECONDS
        with patch("main.time.time", return_value=1000.0 + RATE_LIMIT_SECONDS - 0.1):
            assert is_rate_limited("1.2.3.4") is True

    def test_request_after_window_is_allowed(self):
        with patch("main.time.time", return_value=1000.0):
            is_rate_limited("1.2.3.4")

        with patch("main.time.time", return_value=1000.0 + RATE_LIMIT_SECONDS + 0.1):
            assert is_rate_limited("1.2.3.4") is False
            assert main._last_upload["1.2.3.4"] == 1000.0 + RATE_LIMIT_SECONDS + 0.1

    def test_different_ips_are_independent(self):
        with patch("main.time.time", return_value=2000.0):
            assert is_rate_limited("10.0.0.1") is False
            assert is_rate_limited("10.0.0.2") is False

        with patch("main.time.time", return_value=2000.5):
            assert is_rate_limited("10.0.0.1") is True
            assert is_rate_limited("10.0.0.2") is True
