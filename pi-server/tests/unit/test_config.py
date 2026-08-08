"""
Settings parsing.

Environment values arrive as strings and may be blank or malformed. Defaults
must hold in every one of those cases, because a bad value here would otherwise
disable a safety limit (e.g. the upload size cap) at runtime.
"""

from pathlib import Path

from app.config import (
    DEFAULT_ADVERTISE_SCHEME,
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


class TestDiscoveryAdvertisement:
    def test_defaults_to_http(self):
        assert Settings.from_env({}).advertise_scheme == DEFAULT_ADVERTISE_SCHEME
        assert Settings.from_env({}).advertise_scheme == "http"

    def test_https_is_accepted_for_mtls_field_deployments(self):
        settings = Settings.from_env(
            {"ADVERTISE_SCHEME": "https", "PORT": "8443"}
        )
        assert settings.advertise_scheme == "https"
        assert settings.port == 8443

    def test_scheme_is_case_and_whitespace_tolerant(self):
        assert Settings.from_env({"ADVERTISE_SCHEME": " HTTPS "}).advertise_scheme == "https"

    def test_unknown_scheme_falls_back_instead_of_advertising_a_bad_url(self):
        assert Settings.from_env({"ADVERTISE_SCHEME": "ftp"}).advertise_scheme == "http"


class TestSurfaceStyle:
    """
    Pinned because it is a taste decision that reads like an arbitrary
    constant, and is exactly the sort of thing a later change "tidies". It has
    already moved twice: to terrain, back to blend when terrain replaced the
    drawn colours, and to terrain again once terrain only modulated them.
    """

    def test_defaults_to_terrain(self):
        assert Settings().surface_style == "terrain"
        assert Settings.from_env({}).surface_style == "terrain"

    def test_every_documented_style_is_accepted(self):
        for style in ("blend", "terrain", "off"):
            assert Settings.from_env({"SURFACE_STYLE": style}).surface_style == style

    def test_case_and_padding_are_forgiven(self):
        assert Settings.from_env({"SURFACE_STYLE": "  Terrain "}).surface_style == "terrain"

    def test_an_unknown_style_falls_back_instead_of_raising(self):
        """A typo in a systemd unit must not stop the projector serving planets."""
        assert Settings.from_env({"SURFACE_STYLE": "psychedelic"}).surface_style == "terrain"
        assert Settings.from_env({"SURFACE_STYLE": ""}).surface_style == "terrain"
