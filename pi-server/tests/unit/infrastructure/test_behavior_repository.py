from app.domain.behavior import (
    BehaviorMode,
    EventFrequency,
    GalaxyBehaviorSettings,
    GalaxyTheme,
    ProjectorLanguage,
)
from app.infrastructure.behavior_repository import JsonBehaviorRepository


def test_missing_state_file_uses_safe_defaults(tmp_path):
    assert JsonBehaviorRepository(tmp_path).load() == GalaxyBehaviorSettings()


def test_saved_behavior_survives_repository_recreation(tmp_path):
    settings = GalaxyBehaviorSettings(
        mode=BehaviorMode.MANUAL,
        manual_theme=GalaxyTheme.CHRISTMAS,
        planet_speed=1.5,
        ambient_effects=False,
        projector_language=ProjectorLanguage.FRENCH,
        asteroid_belt_enabled=True,
        comets_enabled=True,
        comet_frequency=EventFrequency.FREQUENT,
        flyby_asteroids_enabled=True,
        flyby_frequency=EventFrequency.RARE,
        enabled_themes=(
            GalaxyTheme.DEFAULT,
            GalaxyTheme.HALLOWEEN,
            GalaxyTheme.CHRISTMAS,
        ),
    )
    JsonBehaviorRepository(tmp_path).save(settings)

    assert JsonBehaviorRepository(tmp_path).load() == settings


def test_legacy_state_defaults_new_environment_settings_safely(tmp_path):
    (tmp_path / "galaxy_behavior.json").write_text(
        '{"mode":"manual","manual_theme":"halloween","planet_speed":1.25,"ambient_effects":true}',
        encoding="utf-8",
    )

    loaded = JsonBehaviorRepository(tmp_path).load()

    assert loaded.projector_language == ProjectorLanguage.ENGLISH
    assert loaded.asteroid_belt_enabled is False
    assert loaded.comets_enabled is False
    assert loaded.comet_frequency == EventFrequency.NORMAL
    assert loaded.flyby_asteroids_enabled is False
    assert loaded.flyby_frequency == EventFrequency.NORMAL
    assert set(loaded.enabled_themes) == set(GalaxyTheme)


def test_corrupt_state_falls_back_instead_of_blocking_projector_start(tmp_path):
    (tmp_path / "galaxy_behavior.json").write_text("{definitely not json", encoding="utf-8")

    assert JsonBehaviorRepository(tmp_path).load() == GalaxyBehaviorSettings()


def test_valid_json_that_is_not_an_object_falls_back(tmp_path):
    """
    Regression: the fallback only caught malformed JSON. A file holding valid
    JSON of the wrong *shape* - `null` after a truncated write, `[]` from a
    hand edit - parsed fine and then died on `.get`, raising AttributeError
    past the except clause. Because the file is on disk it happened on every
    subsequent request too: /api/behavior returned 500 permanently and the
    projector never got its settings, with no way back but deleting the file.
    """
    state = tmp_path / "galaxy_behavior.json"
    for content in ("null", "[]", '"manual"', "42", '["mode","manual"]'):
        state.write_text(content, encoding="utf-8")

        assert JsonBehaviorRepository(tmp_path).load() == GalaxyBehaviorSettings(), content


def test_object_with_wrong_value_types_falls_back(tmp_path):
    """`mode` as a list reaches BehaviorMode(...) and must not escape either."""
    (tmp_path / "galaxy_behavior.json").write_text(
        '{"mode":["manual"],"enabled_themes":"halloween"}', encoding="utf-8"
    )

    assert JsonBehaviorRepository(tmp_path).load() == GalaxyBehaviorSettings()


def test_out_of_range_persisted_speed_falls_back_to_defaults(tmp_path):
    (tmp_path / "galaxy_behavior.json").write_text(
        '{"mode":"manual","manual_theme":"halloween","planet_speed":99}',
        encoding="utf-8",
    )

    assert JsonBehaviorRepository(tmp_path).load() == GalaxyBehaviorSettings()
