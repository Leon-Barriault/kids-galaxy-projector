"""
Domain: filename and display-name rules.

Pure functions - no filesystem, no HTTP, no framework. The distinction under
test is deliberate: the *stored filename* must be safe for the filesystem,
while the *display name* is what the child typed and must survive verbatim.
"""

from app.domain.naming import (
    build_stored_filename,
    normalize_display_name,
    sanitize_filename,
)


class TestSanitizeFilename:
    def test_keeps_simple_name(self):
        assert sanitize_filename("My Planet") == "My Planet"

    def test_preserves_spaces_and_underscores(self):
        assert sanitize_filename("Cool_Planet 1") == "Cool_Planet 1"

    def test_strips_path_separators_and_dots(self):
        result = sanitize_filename("../../etc/passwd")
        assert "/" not in result
        assert "." not in result
        assert ".." not in result

    def test_strips_punctuation(self):
        result = sanitize_filename("My Planet!@#$%^&*()")
        assert "!" not in result
        assert result.strip() == "My Planet"

    def test_length_is_bounded(self):
        assert len(sanitize_filename("A" * 200)) <= 80

    def test_falls_back_when_nothing_survives(self):
        assert sanitize_filename("!@#$%") == "planet"

    def test_falls_back_for_empty_and_none(self):
        assert sanitize_filename("") == "planet.png"
        assert sanitize_filename(None) == "planet.png"


class TestNormalizeDisplayName:
    def test_trims_surrounding_whitespace(self):
        assert normalize_display_name("  Sparkle World  ") == "Sparkle World"

    def test_blank_becomes_default(self):
        assert normalize_display_name("   ") == "My Planet"
        assert normalize_display_name("") == "My Planet"
        assert normalize_display_name(None) == "My Planet"

    def test_keeps_characters_the_filesystem_would_reject(self):
        """The whole point of separating display name from filename."""
        assert normalize_display_name("Alice's World!") == "Alice's World!"

    def test_bounds_absurd_length(self):
        assert len(normalize_display_name("A" * 500)) <= 120


class TestBuildStoredFilename:
    def test_combines_id_and_safe_name(self):
        assert build_stored_filename("abc123", "My Planet") == "abc123_My Planet.png"

    def test_uses_sanitized_form_of_the_name(self):
        name = build_stored_filename("abc123", "Alice's World!")
        assert name == "abc123_Alices World.png"
        assert "'" not in name

    def test_traversal_cannot_escape(self):
        name = build_stored_filename("abc123", "../../etc/passwd")
        assert "/" not in name
        assert name.endswith(".png")
