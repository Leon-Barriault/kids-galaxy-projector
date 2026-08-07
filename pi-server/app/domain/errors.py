"""
Domain errors.

The domain never raises HTTPException - it has no idea it is being served over
HTTP. The API layer translates these into status codes, which keeps the rules
reusable (a CLI importer or a test can raise/catch the same types).
"""


class DomainError(Exception):
    """Base class for every expected, business-rule failure."""

    #: Message that is safe to show a user (no internals, no stack detail).
    user_message = "Something went wrong."

    def __init__(self, user_message: str | None = None):
        if user_message:
            self.user_message = user_message
        super().__init__(self.user_message)


class ValidationError(DomainError):
    """The request was understood but violates a rule."""


class ImageValidationError(ValidationError):
    """The uploaded bytes are not an acceptable image."""

    user_message = "Invalid or corrupted image."


class RateLimitedError(DomainError):
    """The client is sending planets faster than the cooldown allows."""

    user_message = "Please wait a few seconds before sending another planet."
