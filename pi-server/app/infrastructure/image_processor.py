"""
Pillow-backed image processor.

This is the only module that knows about PIL, which keeps the imaging library
out of the domain and lets the use cases be tested without it.
"""

import logging
from io import BytesIO

from PIL import Image

from app.domain.errors import ImageValidationError
from app.domain.image_rules import ensure_dimensions_within
from app.ports import ImageProcessor

logger = logging.getLogger(__name__)


class PillowImageProcessor(ImageProcessor):
    def normalize_to_png(
        self, content: bytes, max_dimension: int, target_size: int
    ) -> bytes:
        self._verify_integrity_and_dimensions(content, max_dimension)
        return self._reencode(content, target_size)

    @staticmethod
    def _verify_integrity_and_dimensions(content: bytes, max_dimension: int) -> None:
        try:
            # First pass: detect truncated or corrupt data.
            with Image.open(BytesIO(content)) as img:
                img.verify()
            # verify() leaves the stream unusable, so re-open to read the size.
            with Image.open(BytesIO(content)) as img:
                width, height = img.size
        except ImageValidationError:
            raise
        except Exception as e:
            logger.warning("Image validation failed: %s", e)
            raise ImageValidationError("Invalid or corrupted image.") from e

        ensure_dimensions_within(width, height, max_dimension)

    @staticmethod
    def _reencode(content: bytes, target_size: int) -> bytes:
        """
        Re-encode to a clean PNG.

        This is a security control as much as a formatting step: anything hidden
        in the original container is discarded because only decoded pixels are
        carried over.
        """
        try:
            with Image.open(BytesIO(content)) as img:
                cleaned = (
                    img.convert("RGBA")
                    if img.mode in ("RGBA", "P")
                    else img.convert("RGB")
                )
                if max(cleaned.size) > target_size:
                    cleaned.thumbnail(
                        (target_size, target_size), Image.Resampling.LANCZOS
                    )

                buffer = BytesIO()
                # No optimize=True: it costs several hundred milliseconds of zlib
                # strategy search for a few percent of size, on the one path
                # where a child is watching a spinner. The texture is served
                # over a LAN, not the internet.
                cleaned.save(buffer, format="PNG")
                return buffer.getvalue()
        except Exception as e:
            logger.error("Failed to process image: %s", e)
            raise ImageValidationError("Could not process the image.") from e
