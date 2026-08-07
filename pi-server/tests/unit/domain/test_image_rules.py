"""
Domain: image acceptance rules.

These are pure predicates over bytes and dimensions. They raise domain errors,
never HTTPException - mapping to HTTP status codes is the API layer's job.
"""

import pytest

from app.domain.errors import ImageValidationError
from app.domain.image_rules import (
    ImageKind,
    detect_image_kind,
    ensure_content_type_allowed,
    ensure_dimensions_within,
    ensure_not_empty,
    ensure_size_within,
)

PNG_MAGIC = b"\x89PNG\r\n\x1a\n"
JPEG_MAGIC = b"\xff\xd8\xff"


class TestDetectImageKind:
    def test_detects_png(self):
        assert detect_image_kind(PNG_MAGIC + b"rest") is ImageKind.PNG

    def test_detects_jpeg(self):
        assert detect_image_kind(JPEG_MAGIC + b"rest") is ImageKind.JPEG

    def test_returns_none_for_other_content(self):
        assert detect_image_kind(b"not an image") is None

    def test_returns_none_for_empty(self):
        assert detect_image_kind(b"") is None

    def test_rejects_png_magic_that_is_truncated(self):
        assert detect_image_kind(b"\x89PNG") is None


class TestEnsureContentTypeAllowed:
    @pytest.mark.parametrize(
        "content_type", ["image/png", "image/jpeg", "image/jpg"]
    )
    def test_allows_supported_types(self, content_type):
        ensure_content_type_allowed(content_type)  # must not raise

    @pytest.mark.parametrize(
        "content_type", ["text/plain", "image/gif", "application/pdf", None, ""]
    )
    def test_rejects_everything_else(self, content_type):
        with pytest.raises(ImageValidationError):
            ensure_content_type_allowed(content_type)


class TestEnsureNotEmpty:
    def test_allows_non_empty(self):
        ensure_not_empty(10)

    def test_rejects_zero(self):
        with pytest.raises(ImageValidationError):
            ensure_not_empty(0)


class TestEnsureSizeWithin:
    def test_allows_at_the_limit(self):
        ensure_size_within(100, max_size=100)

    def test_rejects_one_byte_over(self):
        with pytest.raises(ImageValidationError) as exc:
            ensure_size_within(101, max_size=100)
        assert "too large" in str(exc.value).lower()


class TestEnsureDimensionsWithin:
    def test_allows_at_the_limit(self):
        ensure_dimensions_within(2048, 2048, max_dimension=2048)

    def test_rejects_wide_image(self):
        with pytest.raises(ImageValidationError):
            ensure_dimensions_within(2049, 10, max_dimension=2048)

    def test_rejects_tall_image(self):
        with pytest.raises(ImageValidationError):
            ensure_dimensions_within(10, 2049, max_dimension=2048)
