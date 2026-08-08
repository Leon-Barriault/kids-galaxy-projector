"""
Infrastructure: mDNS advertising.

Registering a real service would bind a multicast socket and make the suite
depend on the network, so the zeroconf library is faked. What is worth pinning
is the contract that keeps a Pi serving planets when discovery goes wrong.
"""

import sys
import types

import pytest

from app.domain.galaxy import GALAXY_SERVICE_TYPE, Galaxy
from app.infrastructure.service_advertiser import (
    NullServiceAdvertiser,
    ZeroconfServiceAdvertiser,
)


class FakeZeroconf:
    instances: list["FakeZeroconf"] = []

    def __init__(self):
        self.registered = []
        self.unregistered = []
        self.closed = False
        FakeZeroconf.instances.append(self)

    def register_service(self, info):
        self.registered.append(info)

    def unregister_service(self, info):
        self.unregistered.append(info)

    def close(self):
        self.closed = True


class FakeServiceInfo:
    def __init__(
        self,
        type_,
        name,
        addresses=None,
        port=None,
        properties=None,
        server=None,
    ):
        self.type = type_
        self.name = name
        self.addresses = addresses
        self.port = port
        self.properties = properties
        self.server = server


@pytest.fixture
def fake_zeroconf(monkeypatch):
    FakeZeroconf.instances = []
    module = types.ModuleType("zeroconf")
    module.Zeroconf = FakeZeroconf
    module.ServiceInfo = FakeServiceInfo
    monkeypatch.setitem(sys.modules, "zeroconf", module)
    return module


class TestAdvertising:
    def test_registers_under_the_galaxy_name(self, fake_zeroconf):
        advertiser = ZeroconfServiceAdvertiser(
            Galaxy(name="Playroom"), 8000, "10.0.0.5"
        )
        advertiser.start()

        info = FakeZeroconf.instances[0].registered[0]
        assert info.type == GALAXY_SERVICE_TYPE
        assert info.name.startswith("Playroom.")
        assert info.port == 8000

    def test_carries_connection_metadata_in_the_txt_record(self, fake_zeroconf):
        """A tablet can build the picker without probing every discovered Pi."""
        ZeroconfServiceAdvertiser(
            Galaxy(name="Attic"),
            8443,
            "10.0.0.5",
            scheme="https",
        ).start()

        properties = FakeZeroconf.instances[0].registered[0].properties
        assert properties["name"] == "Attic"
        assert properties["service"] == "kids-galaxy-projector"
        assert properties["scheme"] == "https"

    def test_unknown_scheme_falls_back_to_http(self, fake_zeroconf):
        ZeroconfServiceAdvertiser(
            Galaxy(), 8000, "10.0.0.5", scheme="gopher"
        ).start()

        properties = FakeZeroconf.instances[0].registered[0].properties
        assert properties["scheme"] == "http"

    def test_uses_the_address_it_was_given(self, fake_zeroconf):
        import socket

        ZeroconfServiceAdvertiser(Galaxy(), 8000, "192.168.1.40").start()
        addresses = FakeZeroconf.instances[0].registered[0].addresses
        assert addresses == [socket.inet_aton("192.168.1.40")]

    def test_withdraws_on_stop(self, fake_zeroconf):
        advertiser = ZeroconfServiceAdvertiser(Galaxy(), 8000, "10.0.0.5")
        advertiser.start()
        advertiser.stop()

        instance = FakeZeroconf.instances[0]
        assert instance.unregistered and instance.closed


class TestFailureIsNotFatal:
    """
    The rule this whole class exists for: a Pi that cannot advertise must still
    serve planets. Multicast is blocked more often than not - a bridged Docker
    network alone is enough - and a projector that refuses to start because
    nobody can discover it would be a far worse failure than one nobody
    discovers.
    """

    def test_a_broken_zeroconf_does_not_raise(self, monkeypatch):
        broken = types.ModuleType("zeroconf")

        def explode(*_args, **_kwargs):
            raise OSError("multicast blocked")

        broken.Zeroconf = explode
        broken.ServiceInfo = explode
        monkeypatch.setitem(sys.modules, "zeroconf", broken)

        ZeroconfServiceAdvertiser(Galaxy(), 8000, "10.0.0.5").start()  # no raise

    def test_a_missing_library_does_not_raise(self, monkeypatch):
        monkeypatch.setitem(sys.modules, "zeroconf", None)
        ZeroconfServiceAdvertiser(Galaxy(), 8000, "10.0.0.5").start()  # no raise

    def test_stopping_something_that_never_started_does_not_raise(self):
        ZeroconfServiceAdvertiser(Galaxy(), 8000).stop()  # no raise

    def test_a_failure_during_withdrawal_does_not_raise(self, fake_zeroconf):
        advertiser = ZeroconfServiceAdvertiser(Galaxy(), 8000, "10.0.0.5")
        advertiser.start()

        def explode(_info):
            raise OSError("gone")

        FakeZeroconf.instances[0].unregister_service = explode
        advertiser.stop()  # no raise


class TestNullAdvertiser:
    def test_does_nothing_quietly(self):
        advertiser = NullServiceAdvertiser()
        advertiser.start()
        advertiser.stop()
