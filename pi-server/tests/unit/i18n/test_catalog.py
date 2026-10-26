"""Locale negotiation and catalog rendering."""

import pytest

from app.domain.errors import ImageValidationError, NotFoundError
from app.domain.image_rules import ensure_size_within
from app.i18n.catalog import catalogs, negotiate, print_sheet_copy, public_message, render


def test_supported_catalogs_have_the_same_keys():
    loaded = catalogs()
    assert set(loaded) == {"en", "fr"}
    assert set(loaded["en"]) == set(loaded["fr"])


def test_french_canadian_accept_language_selects_french():
    assert negotiate("fr-CA,fr;q=0.9,en;q=0.8") == "fr"
    assert negotiate("fr") == "fr"


def test_quality_values_can_prefer_french_over_an_earlier_english_tag():
    assert negotiate("en;q=0.1, fr-CA;q=0.9") == "fr"


def test_missing_or_unknown_language_stays_english():
    assert negotiate(None) == "en"
    assert negotiate("es, de") == "en"
    assert negotiate("en-CA") == "en"


def test_domain_error_english_sentence_comes_from_the_catalog():
    with pytest.raises(ImageValidationError) as captured:
        ensure_size_within(101, max_size=100)
    error = captured.value
    assert error.message_key == "file_too_large"
    assert error.user_message == render("en", "file_too_large", megabytes=0)
    assert "too large" in str(error).lower()


def test_public_message_uses_french_for_a_known_key():
    error = NotFoundError()
    french = public_message(
        "fr-CA",
        message_key=error.message_key,
        message_params=error.message_params,
        fallback=error.user_message,
    )
    assert french == "Planète introuvable."
    assert (
        public_message(
            None,
            message_key=error.message_key,
            message_params=error.message_params,
            fallback=error.user_message,
        )
        == error.user_message
    )


def test_print_sheet_copy_follows_the_requested_locale():
    english = print_sheet_copy("en", variant="webgl", style="ringed", planet_id="p1")
    french = print_sheet_copy("fr-CA", variant="preview", style="ringed", planet_id="p1")
    assert english["heading"] == "Projector WebGL render"
    assert "classic" not in english["meta"]
    assert "ringed" in english["meta"]
    assert french["heading"] == "Aperçu de la planète"
    assert "avec anneau" in french["meta"]
    assert "\u00a0:" in french["meta"]
    assert "Pi server" not in english["footer"]


def test_field_keys_are_translated_inside_the_active_catalog():
    english = render("en", "invalid_manifest_field", field_key="field_canvas_width")
    french = render("fr", "invalid_manifest_field", field_key="field_canvas_width")
    assert english == "Invalid drawing manifest canvas width."
    assert french == "Manifeste de dessin invalide (largeur du canevas)."
