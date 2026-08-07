"""
Infrastructure: the Pillow-backed image processor.

Re-encoding is a security control, not just a formatting step, so these tests
assert that hostile metadata is dropped and that malformed input is rejected.
"""

import io

import pytest
from PIL import Image

from app.domain.errors import ImageValidationError
from app.infrastructure.image_processor import PillowImageProcessor

PNG_MAGIC = b"\x89PNG\r\n\x1a\n"


@pytest.fixture
def processor():
    return PillowImageProcessor()


def png_bytes(width=64, height=64, color=(255, 0, 0), mode="RGB", **save_kwargs):
    img = Image.new(mode, (width, height), color)
    buf = io.BytesIO()
    img.save(buf, format="PNG", **save_kwargs)
    return buf.getvalue()


def jpeg_bytes(width=64, height=64, color=(0, 128, 255)):
    img = Image.new("RGB", (width, height), color)
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return buf.getvalue()


class TestNormalizeToPng:
    def test_returns_png_bytes(self, processor):
        result = processor.normalize_to_png(
            png_bytes(), max_dimension=2048, target_size=1024
        )
        assert result.startswith(PNG_MAGIC)

    def test_converts_jpeg_to_png(self, processor):
        result = processor.normalize_to_png(
            jpeg_bytes(), max_dimension=2048, target_size=1024
        )
        assert result.startswith(PNG_MAGIC)

    def test_preserves_image_dimensions_when_small_enough(self, processor):
        result = processor.normalize_to_png(
            png_bytes(200, 150), max_dimension=2048, target_size=1024
        )
        with Image.open(io.BytesIO(result)) as img:
            assert img.size == (200, 150)

    def test_downsizes_large_images_preserving_aspect(self, processor):
        result = processor.normalize_to_png(
            png_bytes(2000, 1000), max_dimension=2048, target_size=1024
        )
        with Image.open(io.BytesIO(result)) as img:
            assert max(img.size) <= 1024
            # 2:1 aspect ratio must survive the downscale.
            assert img.size[0] == 2 * img.size[1]

    def test_strips_metadata(self, processor):
        """Re-encoding must not carry text chunks from the original file."""
        from PIL import PngImagePlugin

        info = PngImagePlugin.PngInfo()
        info.add_text("Comment", "smuggled-payload")
        original = png_bytes(pnginfo=info)

        # Sanity check: the payload really is in the input.
        with Image.open(io.BytesIO(original)) as img:
            assert "smuggled-payload" in str(img.info)

        cleaned = processor.normalize_to_png(
            original, max_dimension=2048, target_size=1024
        )
        with Image.open(io.BytesIO(cleaned)) as img:
            assert "smuggled-payload" not in str(img.info)

    def test_rejects_oversized_dimensions(self, processor):
        with pytest.raises(ImageValidationError) as exc:
            processor.normalize_to_png(
                png_bytes(3000, 100), max_dimension=2048, target_size=1024
            )
        assert "dimensions" in str(exc.value).lower()

    def test_accepts_dimensions_exactly_at_the_limit(self, processor):
        processor.normalize_to_png(
            png_bytes(2048, 10), max_dimension=2048, target_size=1024
        )

    def test_rejects_garbage_bytes(self, processor):
        with pytest.raises(ImageValidationError):
            processor.normalize_to_png(
                b"definitely not an image", max_dimension=2048, target_size=1024
            )

    def test_rejects_truncated_png(self, processor):
        truncated = png_bytes()[:40]
        with pytest.raises(ImageValidationError):
            processor.normalize_to_png(
                truncated, max_dimension=2048, target_size=1024
            )

    def test_handles_palette_and_alpha_modes(self, processor):
        for mode, color in (("P", 1), ("RGBA", (255, 0, 0, 128)), ("L", 128)):
            data = png_bytes(mode=mode, color=color)
            result = processor.normalize_to_png(
                data, max_dimension=2048, target_size=1024
            )
            assert result.startswith(PNG_MAGIC)
