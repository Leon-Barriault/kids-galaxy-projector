"""
Unit tests – pure functions, no HTTP, no disk side-effects beyond the function itself.
"""

import pytest

from main import sanitize_filename


class TestSanitizeFilename:
    def test_basic(self):
        assert sanitize_filename("My Planet") == "My Planet"

    def test_strips_path_traversal(self):
        result = sanitize_filename("../../etc/passwd")
        assert ".." not in result
        assert "/" not in result
        assert "etc" in result or result == "planet"

    def test_empty_and_none_fallback(self):
        assert sanitize_filename("") == "planet.png"
        assert sanitize_filename(None) == "planet.png"

    def test_length_limit(self):
        long_name = "A" * 200
        assert len(sanitize_filename(long_name)) <= 80

    def test_path_sequences_removed(self):
        result = sanitize_filename("foo/../bar")
        assert ".." not in result
        assert "/" not in result

    def test_special_chars_stripped(self):
        result = sanitize_filename("My Planet!@#$%^&*()")
        assert "!" not in result
        assert result  # not empty

    def test_preserves_spaces_and_underscores(self):
        result = sanitize_filename("Cool_Planet 1")
        assert result == "Cool_Planet 1"
