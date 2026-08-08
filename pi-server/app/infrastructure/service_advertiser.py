"""
Announcing the galaxy on the local network over mDNS.

Tablets browse for `_kidsgalaxy._tcp.local.` and get back a name, an address,
a port and a transport scheme without anyone typing an IP. This is the same
mechanism printers and Chromecasts use, so it works on an ordinary home router.

Two things about the deployment are easy to get wrong and expensive to debug:

* **The container must be on host networking.** mDNS is multicast, and Docker's
  default bridge does not carry multicast out to the LAN. With port mapping the
  server works perfectly and is simply never discovered.
* **Advertising must never be able to stop the server.** A Pi with a firewalled
  multicast group, or two containers racing for the same service name, should
  cost discovery and nothing else - the tablets can still be pointed by hand.
"""

import logging
import socket

from app.domain.galaxy import GALAXY_SERVICE_TYPE, Galaxy
from app.ports import ServiceAdvertiser

logger = logging.getLogger(__name__)


class NullServiceAdvertiser(ServiceAdvertiser):
    """Used when advertising is switched off, and in tests."""

    def start(self) -> None:
        logger.info("mDNS advertising is disabled")

    def stop(self) -> None:
        pass


class ZeroconfServiceAdvertiser(ServiceAdvertiser):
    def __init__(
        self,
        galaxy: Galaxy,
        port: int,
        host_ip: str | None = None,
        scheme: str = "http",
    ):
        self._galaxy = galaxy
        self._port = port
        self._host_ip = host_ip
        self._scheme = scheme if scheme in {"http", "https"} else "http"
        self._zeroconf = None
        self._info = None

    def start(self) -> None:
        try:
            from zeroconf import ServiceInfo, Zeroconf

            address = self._host_ip or self._local_ip()
            self._info = ServiceInfo(
                GALAXY_SERVICE_TYPE,
                f"{self._galaxy.name}.{GALAXY_SERVICE_TYPE}",
                addresses=[socket.inet_aton(address)],
                port=self._port,
                # Properties travel in the mDNS TXT record, so a tablet can
                # render the picker from the browse result alone and only make
                # an HTTP call once the child has chosen.
                properties={
                    "name": self._galaxy.name,
                    "service": self._galaxy.to_payload()["service"],
                    "scheme": self._scheme,
                },
                server=f"{self._safe_hostname()}.local.",
            )
            self._zeroconf = Zeroconf()
            self._zeroconf.register_service(self._info)
            logger.info(
                "Advertising '%s' at %s://%s:%s over mDNS",
                self._galaxy.name,
                self._scheme,
                address,
                self._port,
            )
        except Exception as e:  # discovery must never be fatal
            logger.warning(
                "Could not advertise over mDNS (%s). The server is running; "
                "tablets will need the address entered by hand, or the "
                "container may need network_mode: host.",
                e,
            )
            self._zeroconf = None
            self._info = None

    def stop(self) -> None:
        if self._zeroconf is None:
            return
        try:
            if self._info is not None:
                self._zeroconf.unregister_service(self._info)
            self._zeroconf.close()
        except Exception as e:  # shutdown must not raise
            logger.warning("Could not withdraw the mDNS advertisement: %s", e)
        finally:
            self._zeroconf = None
            self._info = None

    @staticmethod
    def _local_ip() -> str:
        """
        The address on the interface that reaches the LAN.

        Opening a UDP socket to an outside address and reading back the local
        end picks the right interface without sending a packet. Resolving the
        hostname instead returns 127.0.0.1 on most Linux images, which would
        advertise a galaxy nobody can reach.
        """
        probe = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        try:
            probe.connect(("192.0.2.1", 9))  # TEST-NET-1, never routed
            return probe.getsockname()[0]
        except OSError:
            return "127.0.0.1"
        finally:
            probe.close()

    @staticmethod
    def _safe_hostname() -> str:
        raw = socket.gethostname().split(".")[0]
        cleaned = "".join(c for c in raw if c.isalnum() or c == "-")
        return cleaned or "kidsgalaxy"
