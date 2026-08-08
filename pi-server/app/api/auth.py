"""HTTP authorization at the transport boundary.

The application/domain layers do not know about client roles. In secure field
mode an mTLS reverse proxy on the same machine verifies the client certificate
and forwards a role derived from that certificate. Role headers from remote
clients are never trusted directly.
"""

from enum import StrEnum

from fastapi import HTTPException, Request

from app.config import Settings

ROLE_HEADER = "x-kids-galaxy-role"
VERIFIED_HEADER = "x-kids-galaxy-client-verified"
PROXY_HEADER = "x-kids-galaxy-proxy"
PROXY_MARKER = "mtls-gateway"


class ClientRole(StrEnum):
    KID = "kid"
    MANAGER = "manager"
    PROJECTOR = "projector"


class AuthorizationPolicy:
    def __init__(self, settings: Settings):
        self._enabled = settings.authorization_enabled
        self._trusted_proxy_hosts = frozenset(settings.trusted_role_proxy_hosts)

    @property
    def enabled(self) -> bool:
        return self._enabled

    def role_for(self, request: Request) -> ClientRole | None:
        """Resolve a role only from a trusted local transport boundary."""
        if not self._enabled:
            return None

        host = request.client.host if request.client else ""
        if host not in self._trusted_proxy_hosts:
            return None

        came_through_gateway = request.headers.get(PROXY_HEADER) == PROXY_MARKER
        if came_through_gateway:
            if request.headers.get(VERIFIED_HEADER) != "SUCCESS":
                return None
            forwarded = request.headers.get(ROLE_HEADER)
            if not forwarded:
                return None
            try:
                return ClientRole(forwarded.strip().lower())
            except ValueError:
                return None

        # A role header outside the explicitly-marked gateway path is always
        # suspicious, even on loopback. Do not let a local process self-promote.
        if request.headers.get(ROLE_HEADER) or request.headers.get(VERIFIED_HEADER):
            return None

        # Projector Chromium talks directly to FastAPI over loopback. It carries
        # no gateway marker and receives only read/render capabilities.
        return ClientRole.PROJECTOR

    def require(
        self,
        request: Request,
        *allowed: ClientRole,
    ) -> ClientRole | None:
        """Raise 403 when secure mode is enabled and the role lacks capability."""
        if not self._enabled:
            return None

        role = self.role_for(request)
        if role not in allowed:
            raise HTTPException(
                status_code=403,
                detail="This client is not allowed to do that",
            )
        return role

    def dependency(self, *allowed: ClientRole):
        def guard(request: Request) -> None:
            self.require(request, *allowed)

        return guard
