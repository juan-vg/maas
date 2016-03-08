# Copyright 2014-2015 Canonical Ltd.  This software is licensed under the
# GNU Affero General Public License version 3 (see the file LICENSE).

"""Tests for :py:module:`~provisioningserver.rpc.dhcp`."""

__all__ = []

from fixtures import FakeLogger
from maastesting.factory import factory
from maastesting.matchers import (
    MockAnyCall,
    MockCalledOnceWith,
    MockCalledWith,
    MockNotCalled,
)
from maastesting.testcase import MAASTestCase
from mock import ANY
from provisioningserver.dhcp.testing.config import (
    make_failover_peer_config,
    make_host,
    make_interface,
    make_shared_network,
)
from provisioningserver.drivers.service import ServiceRegistry
from provisioningserver.rpc import (
    dhcp,
    exceptions,
)
from provisioningserver.service_monitor import ServiceActionError
from provisioningserver.utils.shell import ExternalProcessError


class TestConfigureDHCP(MAASTestCase):

    scenarios = (
        ("DHCPv4", {"server": dhcp.DHCPv4Server}),
        ("DHCPv6", {"server": dhcp.DHCPv6Server}),
    )

    def configure(
            self, omapi_key, failover_peers, shared_networks,
            hosts, interfaces):
        server = self.server(omapi_key)
        dhcp.configure(
            server, failover_peers, shared_networks, hosts, interfaces)

    def patch_os_exists(self):
        return self.patch_autospec(dhcp.os.path, "exists")

    def patch_sudo_delete_file(self):
        return self.patch_autospec(dhcp, 'sudo_delete_file')

    def patch_sudo_write_file(self):
        return self.patch_autospec(dhcp, 'sudo_write_file')

    def patch_restart_service(self):
        return self.patch(dhcp.service_monitor, 'restart_service')

    def patch_ensure_service(self):
        return self.patch(dhcp.service_monitor, 'ensure_service')

    def patch_get_config(self):
        return self.patch_autospec(dhcp, 'get_config')

    def test__extracts_interfaces(self):
        write_file = self.patch_sudo_write_file()
        self.patch_restart_service()
        failover_peers = [make_failover_peer_config() for _ in range(3)]
        shared_networks = [make_shared_network() for _ in range(3)]
        hosts = [make_host() for _ in range(3)]
        interfaces_names = [
            factory.make_name("eth")
            for _ in range(3)
        ]
        interfaces = [
            make_interface(name=name)
            for name in interfaces_names
        ]
        self.configure(
            factory.make_name('key'), failover_peers, shared_networks,
            hosts, interfaces)
        expected_interfaces = ' '.join(sorted(interfaces_names))
        self.assertThat(
            write_file,
            MockCalledWith(
                ANY,
                expected_interfaces.encode("utf-8")))

    def test__composes_dhcp_config(self):
        self.patch_sudo_write_file()
        self.patch_restart_service()
        get_config = self.patch_get_config()
        omapi_key = factory.make_name('key')
        failover_peer = make_failover_peer_config()
        shared_network = make_shared_network()
        host = make_host()
        interface = make_interface()
        self.configure(
            omapi_key, [failover_peer], [shared_network], [host], [interface])
        self.assertThat(
            get_config,
            MockCalledOnceWith(
                self.server.template_basename, omapi_key=omapi_key,
                failover_peers=[failover_peer],
                shared_networks=[shared_network],
                hosts=[host]))

    def test__writes_dhcp_config(self):
        write_file = self.patch_sudo_write_file()
        self.patch_restart_service()

        failover_peers = make_failover_peer_config()
        shared_network = make_shared_network()
        host = make_host()
        interface = make_interface()
        expected_config = factory.make_name('config')
        self.patch_get_config().return_value = expected_config

        self.configure(
            factory.make_name('key'),
            [failover_peers], [shared_network], [host], [interface])

        self.assertThat(
            write_file,
            MockAnyCall(
                self.server.config_filename, expected_config.encode("utf-8")))

    def test__writes_interfaces_file(self):
        write_file = self.patch_sudo_write_file()
        self.patch_restart_service()
        self.configure(
            factory.make_name('key'),
            [make_failover_peer_config()], [make_shared_network()],
            [make_host()], [make_interface()])
        self.assertThat(
            write_file,
            MockCalledWith(self.server.interfaces_filename, ANY))

    def test__restarts_dhcp_server_if_subnets_defined(self):
        self.patch_sudo_write_file()
        dhcp_service = ServiceRegistry[self.server.dhcp_service]
        on = self.patch_autospec(dhcp_service, "on")
        restart_service = self.patch_restart_service()
        self.configure(
            factory.make_name('key'),
            [make_failover_peer_config()], [make_shared_network()],
            [make_host()], [make_interface()])
        self.assertThat(on, MockCalledOnceWith())
        self.assertThat(
            restart_service, MockCalledOnceWith(self.server.dhcp_service))

    def test__deletes_dhcp_config_if_no_subnets_defined(self):
        mock_exists = self.patch_os_exists()
        mock_exists.return_value = True
        mock_sudo_delete = self.patch_sudo_delete_file()
        dhcp_service = ServiceRegistry[self.server.dhcp_service]
        self.patch_autospec(dhcp_service, "off")
        self.patch_restart_service()
        self.patch_ensure_service()
        self.configure(factory.make_name('key'), [], [], [], [])
        self.assertThat(
            mock_sudo_delete, MockCalledOnceWith(self.server.config_filename))

    def test__stops_dhcp_server_if_no_subnets_defined(self):
        mock_exists = self.patch_os_exists()
        mock_exists.return_value = False
        dhcp_service = ServiceRegistry[self.server.dhcp_service]
        off = self.patch_autospec(dhcp_service, "off")
        restart_service = self.patch_restart_service()
        ensure_service = self.patch_ensure_service()
        self.configure(factory.make_name('key'), [], [], [], [])
        self.assertThat(off, MockCalledOnceWith())
        self.assertThat(
            ensure_service, MockCalledOnceWith(self.server.dhcp_service))
        self.assertThat(restart_service, MockNotCalled())

    def test__converts_failure_writing_file_to_CannotConfigureDHCP(self):
        self.patch_sudo_write_file().side_effect = (
            ExternalProcessError(1, "sudo something"))
        self.patch_restart_service()
        self.assertRaises(
            exceptions.CannotConfigureDHCP, self.configure,
            factory.make_name('key'),
            [make_failover_peer_config()], [make_shared_network()],
            [make_host()], [make_interface()])

    def test__converts_dhcp_restart_failure_to_CannotConfigureDHCP(self):
        self.patch_sudo_write_file()
        self.patch_restart_service().side_effect = ServiceActionError()
        self.assertRaises(
            exceptions.CannotConfigureDHCP, self.configure,
            factory.make_name('key'),
            [make_failover_peer_config()], [make_shared_network()],
            [make_host()], [make_interface()])

    def test__converts_stop_dhcp_server_failure_to_CannotConfigureDHCP(self):
        self.patch_sudo_write_file()
        self.patch_ensure_service().side_effect = ServiceActionError()
        self.assertRaises(
            exceptions.CannotConfigureDHCP, self.configure,
            factory.make_name('key'), [], [], [], [])

    def test__does_not_log_ServiceActionError(self):
        self.patch_sudo_write_file()
        self.patch_ensure_service().side_effect = ServiceActionError()
        with FakeLogger("maas") as logger:
            self.assertRaises(
                exceptions.CannotConfigureDHCP, self.configure,
                factory.make_name('key'), [], [], [], [])
        self.assertDocTestMatches("", logger.output)

    def test__does_log_other_exceptions(self):
        self.patch_sudo_write_file()
        self.patch_ensure_service().side_effect = (
            factory.make_exception("DHCP is on strike today"))
        with FakeLogger("maas") as logger:
            self.assertRaises(
                exceptions.CannotConfigureDHCP, self.configure,
                factory.make_name('key'), [], [], [], [])
        self.assertDocTestMatches(
            "DHCPv... server failed to stop: DHCP is on strike today",
            logger.output)

    def test__does_not_log_ServiceActionError_when_restarting(self):
        self.patch_sudo_write_file()
        self.patch_restart_service().side_effect = ServiceActionError()
        with FakeLogger("maas") as logger:
            self.assertRaises(
                exceptions.CannotConfigureDHCP, self.configure,
                factory.make_name('key'),
                [make_failover_peer_config()], [make_shared_network()],
                [make_host()], [make_interface()])
        self.assertDocTestMatches("", logger.output)

    def test__does_log_other_exceptions_when_restarting(self):
        self.patch_sudo_write_file()
        self.patch_restart_service().side_effect = (
            factory.make_exception("DHCP is on strike today"))
        with FakeLogger("maas") as logger:
            self.assertRaises(
                exceptions.CannotConfigureDHCP, self.configure,
                factory.make_name('key'),
                [make_failover_peer_config()], [make_shared_network()],
                [make_host()], [make_interface()])
        self.assertDocTestMatches(
            "DHCPv... server failed to restart (for network interfaces ...): "
            "DHCP is on strike today", logger.output)