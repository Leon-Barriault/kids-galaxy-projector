"""
The Galaxy entity: one Pi, one projector, one name.

Children's tablets have to tell several apart on a home network - a school
might run one per classroom - so the name is a first-class part of the domain
rather than a label bolted on at the edge.
"""

from dataclasses import dataclass

#: mDNS service type tablets browse for. The leading underscore and trailing
#: ".local." are required by the protocol, not decoration.
GALAXY_SERVICE_TYPE = "_kidsgalaxy._tcp.local."

#: Marker in the HTTP payload. The subnet-scan fallback probes every address on
#: the LAN, and without this it cannot tell a galaxy from any other web server
#: that happens to answer - the picker would fill with routers and printers.
SERVICE_MARKER = "kids-galaxy-projector"

#: Used when nothing was configured. A blank row in a picker is worse than a
#: dull one: a volunteer cannot choose between two of them.
DEFAULT_NAME = "Kids Galaxy"

#: mDNS instance names are length-limited, and a picker row is one line on a
#: phone. One cap satisfies both.
MAX_NAME_LENGTH = 63


@dataclass(frozen=True)
class Galaxy:
    """A projector installation, as it presents itself to tablets."""

    name: str = DEFAULT_NAME

    def __post_init__(self) -> None:
        cleaned = (self.name or "").strip()[:MAX_NAME_LENGTH]
        # frozen dataclass: normalising has to go through object.__setattr__.
        object.__setattr__(self, "name", cleaned or DEFAULT_NAME)

    def to_payload(self) -> dict:
        """What GET /api/galaxy returns, and what a subnet scan matches on."""
        return {"service": SERVICE_MARKER, "name": self.name}
