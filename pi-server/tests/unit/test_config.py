"""
Settings parsing.

Environment values arrive as strings and may be blank or malformed. Defaults
must hold in every one of those cases, because a bad value here would otherwise
disable a safety limit (e.g. the upload size cap) at runtime.
"""

from pathlib import Path

from app.config import (
    DEFAULT_MAX_FILE_SIZE,
    DEFAULT_MAX_STORED_PLANETS,
    Settings,
)


class TestDefaults:
    def test_sensible_defaults_with_empty_environment(self):
        settings = Settings.from_env({})
        assert settings.upload_dir == Path("uploads")
        assert settings.static_dir == Path("static")
        assert settings.max_file_size == DEFAULT_MAX_FILE_SIZE
        assert settings.max_stored_planets == DEFAULT_MAX_STORED_PLANETS
        assert settings.allowed_origins == ("*",)

    def test_defaults_to_production_mode(self):
        """Docs must be off unless development is explicitly requested."""
        assert Settings.from_env({}).is_development is False


class TestOverrides:
    def test_reads_paths_and_limits(self):
        settings = Settings.from_env(
            {
                "UPLOAD_DIR": "/data/planets",
                "STATIC_DIR": "/srv/static",
                "MAX_FILE_SIZE": "1048576",
                "MAX_STORED_PLANETS": "5",
            }
        )
        assert settings.upload_dir == Path("/data/planets")
        assert settings.static_dir == Path("/srv/static")
        assert settings.max_file_size == 1048576
        assert settings.max_stored_planets == 5

    def test_blank_values_fall_back_to_defaults(self):
        settings = Settings.from_env({"MAX_FILE_SIZE": "   ", "UPLOAD_DIR": ""})
        assert settings.max_file_size == DEFAULT_MAX_FILE_SIZE
        assert settings.upload_dir == Path("uploads")

    def test_non_numeric_values_fall_back_rather_than_crash(self):
        """A typo must not remove the upload size limit."""
        settings = Settings.from_env({"MAX_FILE_SIZE": "five megabytes"})
        assert settings.max_file_size == DEFAULT_MAX_FILE_SIZE


class TestAllowedOrigins:
    def test_wildcard_by_default(self):
        assert Settings.from_env({"ALLOWED_ORIGINS": "*"}).allowed_origins == ("*",)

    def test_comma_separated_list_is_split_and_trimmed(self):
        settings = Settings.from_env(
            {"ALLOWED_ORIGINS": "http://10.42.0.1:8000, https://kids-galaxy.local "}
        )
        assert settings.allowed_origins == (
            "http://10.42.0.1:8000",
            "https://kids-galaxy.local",
        )

    def test_empty_entries_are_dropped(self):
        settings = Settings.from_env({"ALLOWED_ORIGINS": "http://a,,http://b,"})
        assert settings.allowed_origins == ("http://a", "http://b")


class TestEnvironmentFlag:
    def test_development_aliases(self):
        for value in ("development", "dev", "local", "DEVELOPMENT"):
            assert Settings.from_env({"ENVIRONMENT": value}).is_development is True

    def test_production_is_not_development(self):
        for value in ("production", "prod", "staging"):
            assert Settings.from_env({"ENVIRONMENT": value}).is_development is False
