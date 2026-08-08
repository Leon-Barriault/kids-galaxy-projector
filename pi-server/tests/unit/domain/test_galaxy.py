"""
Domain: the identity a projector advertises to tablets.

A "galaxy" is one Pi running one projector. Children's tablets have to tell
several apart on a home network, and a volunteer has to recognise which is
which, so the name is a first-class thing rather than a label bolted on.
"""

import dataclasses

import pytest

from app.domain.galaxy import GALAXY_SERVICE_TYPE, Galaxy


class TestName:
    def test_keeps_the_name_it_was_given(self):
        assert Galaxy(name="Alice's Room").name == "Alice's Room"

    def test_a_blank_name_falls_back_rather_than_advertising_nothing(self):
        """
        An unnamed galaxy in a picker is a blank row a volunteer cannot choose
        between. Better a dull default than an empty one.
        """
        for blank in ("", "   ", "\t\n"):
            assert Galaxy(name=blank).name == "Kids Galaxy"

    def test_the_name_is_trimmed(self):
        assert Galaxy(name="  Playroom  ").name == "Playroom"

    def test_an_absurdly_long_name_is_cut(self):
        """
        mDNS service names are length-limited, and a picker row is one line on
        a phone. Truncating here means both constraints are met in one place.
        """
        galaxy = Galaxy(name="x" * 200)
        assert len(galaxy.name) <= 63


class TestPayload:
    def test_shape(self):
        assert Galaxy(name="Playroom").to_payload() == {
            "service": "kids-galaxy-projector",
            "name": "Playroom",
        }

    def test_the_service_marker_is_what_a_scan_matches_on(self):
        """
        The subnet-scan fallback probes every address on the LAN. Without a
        marker it cannot tell a galaxy from any other web server that happens
        to answer, and the picker fills up with routers and printers.
        """
        assert Galaxy(name="Anything").to_payload()["service"] == "kids-galaxy-projector"


class TestServiceType:
    def test_is_a_valid_mdns_service_type(self):
        assert GALAXY_SERVICE_TYPE == "_kidsgalaxy._tcp.local."
        assert GALAXY_SERVICE_TYPE.endswith(".local.")


class TestImmutability:
    def test_is_frozen(self):
        galaxy = Galaxy(name="Fixed")
        with pytest.raises(dataclasses.FrozenInstanceError):
            galaxy.name = "Changed"  # type: ignore[misc]
