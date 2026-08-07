"""
Image acceptance rules.

Pure predicates over bytes, sizes and dimensions. They raise domain errors and
know nothing about HTTP, so the same rules can be applied by any caller.
"""

from enum import Enum

from app.domain.errors import ImageValidationError

ALLOWED_CONTENT_TYPES = frozenset({"image/png", "image/jpeg", "image/jpg"})

PNG_MAGIC = b"\x89PNG\r\n\x1a\n"
JPEG_MAGIC = b"\xff\xd8\xff"


class ImageKind(Enum):
    PNG = "png"
    JPEG = "jpeg"


def detect_image_kind(content: bytes) -> ImageKind | None:
    """
    Identify the format from its magic bytes.

    Content type headers are client-supplied and therefore untrustworthy; the
    leading bytes are what actually determine the format.
    """
    if content.startswith(PNG_MAGIC):
        return ImageKind.PNG
    if content.startswith(JPEG_MAGIC):
        return ImageKind.JPEG
    return None


def ensure_content_type_allowed(content_type: str | None) -> None:
    if content_type not in ALLOWED_CONTENT_TYPES:
        raise ImageValidationError("Only PNG and JPEG images are allowed.")


def ensure_not_empty(size: int) -> None:
    if size == 0:
        raise ImageValidationError("Empty file.")


def ensure_size_within(size: int, max_size: int) -> None:
    if size > max_size:
        megabytes = max_size // 1024 // 1024
        raise ImageValidationError(f"File too large (max {megabytes} MB).")


def ensure_dimensions_within(width: int, height: int, max_dimension: int) -> None:
    if width > max_dimension or height > max_dimension:
        raise ImageValidationError(
            f"Image dimensions too large (max {max_dimension}px)."
        )


def ensure_recognised_image(content: bytes) -> ImageKind:
    """Combine the magic-byte check with a clear error for anything else."""
    kind = detect_image_kind(content)
    if kind is None:
        raise ImageValidationError("File content is not a valid PNG or JPEG.")
    return kind
