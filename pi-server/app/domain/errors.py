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

    Subclasses should set a sensible default message key. The English sentence
    is rendered from the catalog so logs and unlocalized clients stay stable,
    and the API can render the same key in Canadian French.
    """

    #: Catalog key used when a subclass is raised without an explicit message.
    default_message_key = "something_went_wrong"

    def __init__(
        self,
        user_message: str | None = None,
        *,
        message_key: str | None = None,
        **params: object,
    ):
        key = (
            message_key
            if message_key is not None
            else (None if user_message else self.default_message_key)
        )
        self.message_key = key
        self.message_params = dict(params)
        if key is not None and user_message is None:
            # Imported lazily so the domain module can be inspected without
            # loading catalogs at class-definition time.
            from app.i18n.catalog import render

            self.user_message = render("en", key, **self.message_params)
        elif user_message:
            self.user_message = user_message
        else:
            self.user_message = "Something went wrong."
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

    default_message_key = "invalid_or_corrupted_image"


class RateLimitedError(DomainError):
    """The client is sending planets faster than the cooldown allows.

    Protects the Pi from rapid-fire uploads that would fill disk or starve the
    image-processing pipeline.
    """

    default_message_key = "rate_limited"


class NotFoundError(DomainError):
    """The requested planet does not exist (or was already removed).

    Used by delete and any lookup that must distinguish "missing" from other
    failures.
    """

    default_message_key = "planet_not_found"
