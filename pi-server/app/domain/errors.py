"""
Domain errors.

The domain never raises HTTPException - it has no idea it is being served over
HTTP. The API layer translates these into status codes, which keeps the rules
reusable (a CLI importer or a test can raise/catch the same types).

All expected business-rule failures inherit from DomainError so the API can
catch them uniformly and map them to appropriate HTTP responses without
leaking internal details to the client.
"""


class DomainError(Exception):
    """Base class for every expected, business-rule failure.

    Subclasses should set a sensible default ``user_message`` that is safe to
    show to a child or volunteer (no stack traces, no internal paths).
    """

    #: Message that is safe to show a user (no internals, no stack detail).
    user_message = "Something went wrong."

    def __init__(self, user_message: str | None = None):
        if user_message:
            self.user_message = user_message
        super().__init__(self.user_message)


class ValidationError(DomainError):
    """The request was understood but violates a domain rule.

    Typical sources: invalid planet style, unknown companion, bad ring colour,
    or a display name that fails normalisation rules.
    """


class ImageValidationError(ValidationError):
    """The uploaded bytes are not an acceptable image.

    Raised for wrong content type, empty body, oversized file, or content that
    does not start with a recognised PNG/JPEG magic sequence.
    """

    user_message = "Invalid or corrupted image."


class RateLimitedError(DomainError):
    """The client is sending planets faster than the cooldown allows.

    Protects the Pi from rapid-fire uploads that would fill disk or starve the
    image-processing pipeline.
    """

    user_message = "Please wait a few seconds before sending another planet."


class NotFoundError(DomainError):
    """The requested planet does not exist (or was already removed).

    Used by delete and any lookup that must distinguish "missing" from other
    failures.
    """

    user_message = "Planet not found."
