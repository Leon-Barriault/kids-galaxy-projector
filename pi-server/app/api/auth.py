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
CLIENT_ID_HEADER = "x-kids-galaxy-client-id"
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

    def forwarded_by_trusted_gateway(self, request: Request) -> bool:
        """
        Whether this request arrived through the local mTLS gateway.

        Callers use this to decide if gateway-supplied headers may be believed.
        It is deliberately independent of `enabled`: the question "did this come
        from the proxy on loopback" has the same answer either way, and the
        peer-address check is what makes it unspoofable.
        """
        host = request.client.host if request.client else ""
        return (
            host in self._trusted_proxy_hosts
            and request.headers.get(PROXY_HEADER) == PROXY_MARKER
        )

    def client_identity(self, request: Request) -> str | None:
        """
        A stable per-client identity forwarded by the gateway, when there is one.

        Behind the proxy every tablet shares one peer address, so anything keyed
        on the peer address alone (the upload cooldown) silently becomes global.
        The gateway forwards the client certificate serial, which is unique per
        issued tablet certificate and carries no personal data.
        """
        if not self.forwarded_by_trusted_gateway(request):
            return None
        forwarded = (request.headers.get(CLIENT_ID_HEADER) or "").strip()
        # Certificates are optional at the edge; an anonymous client simply has
        # no identity to offer and falls back to sharing the peer-address bucket.
        return forwarded[:128] or None

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
