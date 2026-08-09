from app.domain.behavior import (
    BehaviorMode,
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
    )
    JsonBehaviorRepository(tmp_path).save(settings)

    assert JsonBehaviorRepository(tmp_path).load() == settings


def test_legacy_state_without_language_defaults_to_english(tmp_path):
    (tmp_path / "galaxy_behavior.json").write_text(
        '{"mode":"manual","manual_theme":"halloween","planet_speed":1.25,"ambient_effects":true}',
        encoding="utf-8",
    )

    loaded = JsonBehaviorRepository(tmp_path).load()

    assert loaded.projector_language == ProjectorLanguage.ENGLISH


def test_corrupt_state_falls_back_instead_of_blocking_projector_start(tmp_path):
    (tmp_path / "galaxy_behavior.json").write_text("{definitely not json", encoding="utf-8")

    assert JsonBehaviorRepository(tmp_path).load() == GalaxyBehaviorSettings()


def test_out_of_range_persisted_speed_falls_back_to_defaults(tmp_path):
    (tmp_path / "galaxy_behavior.json").write_text(
        '{"mode":"manual","manual_theme":"halloween","planet_speed":99}',
        encoding="utf-8",
    )

    assert JsonBehaviorRepository(tmp_path).load() == GalaxyBehaviorSettings()
