# Copyright 2015 Canonical Ltd.  This software is licensed under the
# GNU Affero General Public License version 3 (see the file LICENSE).

"""Tests for `maasserver.websockets.listener`"""

__all__ = []

from collections import namedtuple
import errno

from crochet import wait_for
from django.db import connection
from maasserver import listener as listener_module
from maasserver.listener import (
    PostgresListenerNotifyError,
    PostgresListenerService,
)
from maasserver.testing.factory import factory
from maasserver.testing.testcase import MAASServerTestCase
from maasserver.utils.orm import transactional
from maasserver.utils.threads import deferToDatabase
from maastesting.matchers import (
    MockCalledOnceWith,
    MockCalledWith,
    MockNotCalled,
)
from mock import (
    ANY,
    sentinel,
)
from provisioningserver.utils.twisted import DeferredValue
from psycopg2 import OperationalError
from testtools import ExpectedException
from testtools.matchers import (
    Equals,
    Is,
    IsInstance,
    Not,
)
from twisted.internet import (
    error,
    reactor,
)
from twisted.internet.defer import (
    CancelledError,
    Deferred,
    inlineCallbacks,
)
from twisted.python.failure import Failure


wait_for_reactor = wait_for(30)  # 30 seconds.


FakeNotify = namedtuple("FakeNotify", ["channel", "payload"])


class TestPostgresListenerService(MAASServerTestCase):

    @transactional
    def send_notification(self, event, obj_id):
        cursor = connection.cursor()
        cursor.execute("NOTIFY %s, '%s';" % (event, obj_id))
        cursor.close()

    @wait_for_reactor
    @inlineCallbacks
    def test__calls_handler_on_notification(self):
        listener = PostgresListenerService()
        dv = DeferredValue()
        listener.register("machine", lambda *args: dv.set(args))
        yield listener.startService()
        try:
            yield deferToDatabase(self.send_notification, "machine_create", 1)
            yield dv.get(timeout=2)
            self.assertEqual(('create', '1'), dv.value)
        finally:
            yield listener.stopService()

    @wait_for_reactor
    @inlineCallbacks
    def test__calls_handler_on_notification_with_delayed_registration(self):
        listener = PostgresListenerService()
        dv = DeferredValue()
        yield listener.startService()
        try:
            # Register after the service has been started. The handler should
            # still be called.
            listener.register("machine", lambda *args: dv.set(args))
            yield deferToDatabase(self.send_notification, "machine_create", 1)
            yield dv.get(timeout=2)
            self.assertEqual(('create', '1'), dv.value)
        finally:
            yield listener.stopService()

    @wait_for_reactor
    @inlineCallbacks
    def test__tryConnection_connects_to_database(self):
        listener = PostgresListenerService()

        yield listener.tryConnection()
        try:
            self.assertTrue(listener.connected())
        finally:
            yield listener.stopService()

    @wait_for_reactor
    @inlineCallbacks
    def test__tryConnection_sets_registeredChannels_to_True(self):
        listener = PostgresListenerService()

        yield listener.tryConnection()
        try:
            self.assertTrue(listener.registeredChannels)
        finally:
            yield listener.stopService()

    @wait_for_reactor
    @inlineCallbacks
    def test__tryConnection_logs_error(self):
        listener = PostgresListenerService()

        exception_type = factory.make_exception_type()
        exception_message = factory.make_name("message")

        startConnection = self.patch(listener, "startConnection")
        startConnection.side_effect = exception_type(exception_message)
        mock_logMsg = self.patch(listener, "logMsg")

        with ExpectedException(exception_type):
            yield listener.tryConnection()

        self.assertThat(
            mock_logMsg,
            MockCalledOnceWith(
                format="Unable to connect to database: %(error)s",
                error=exception_message))

    @wait_for_reactor
    @inlineCallbacks
    def test__tryConnection_will_retry_in_3_seconds_if_autoReconnect_set(self):
        listener = PostgresListenerService()
        listener.autoReconnect = True

        startConnection = self.patch(listener, "startConnection")
        startConnection.side_effect = factory.make_exception()
        deferLater = self.patch(listener_module, "deferLater")
        deferLater.return_value = sentinel.retry

        result = yield listener.tryConnection()

        self.assertThat(result, Is(sentinel.retry))
        self.assertThat(deferLater, MockCalledWith(reactor, 3, ANY))

    @wait_for_reactor
    @inlineCallbacks
    def test__tryConnection_will_not_retry_if_autoReconnect_not_set(self):
        listener = PostgresListenerService()
        listener.autoReconnect = False

        exception_type = factory.make_exception_type()
        exception_message = factory.make_name("message")

        startConnection = self.patch(listener, "startConnection")
        startConnection.side_effect = exception_type(exception_message)
        deferLater = self.patch(listener_module, "deferLater")
        deferLater.return_value = sentinel.retry

        with ExpectedException(exception_type):
            yield listener.tryConnection()

        self.assertThat(deferLater, MockNotCalled())

    @wait_for_reactor
    @inlineCallbacks
    def test__stopping_cancels_start(self):
        listener = PostgresListenerService()

        # Start then stop immediately, without waiting for start to complete.
        starting = listener.startService()
        starting_spy = DeferredValue()
        starting_spy.observe(starting)
        stopping = listener.stopService()

        # Both `starting` and `stopping` have callbacks yet to fire.
        self.assertThat(starting.callbacks, Not(Equals([])))
        self.assertThat(stopping.callbacks, Not(Equals([])))

        # Wait for the listener to stop.
        yield stopping

        # Neither `starting` nor `stopping` have callbacks. This is because
        # `stopping` chained itself onto the end of `starting`.
        self.assertThat(starting.callbacks, Equals([]))
        self.assertThat(stopping.callbacks, Equals([]))

        # Confirmation that `starting` was cancelled.
        with ExpectedException(CancelledError):
            yield starting_spy.get()

    @wait_for_reactor
    def test__multiple_starts_return_same_Deferred(self):
        listener = PostgresListenerService()
        self.assertThat(listener.startService(), Is(listener.startService()))
        return listener.stopService()

    @wait_for_reactor
    def test__multiple_stops_return_same_Deferred(self):
        listener = PostgresListenerService()
        self.assertThat(listener.stopService(), Is(listener.stopService()))
        return listener.stopService()

    @wait_for_reactor
    @inlineCallbacks
    def test__tryConnection_calls_registerChannels_after_startConnection(self):
        listener = PostgresListenerService()

        exception_type = factory.make_exception_type()

        self.patch(listener, "startConnection")
        mock_registerChannels = self.patch(listener, "registerChannels")
        mock_registerChannels.side_effect = exception_type

        with ExpectedException(exception_type):
            yield listener.tryConnection()

        self.assertThat(
            mock_registerChannels,
            MockCalledOnceWith())

    @wait_for_reactor
    @inlineCallbacks
    def test__tryConnection_adds_self_to_reactor(self):
        listener = PostgresListenerService()

        # Spy on calls to reactor.addReader.
        self.patch(reactor, "addReader").side_effect = reactor.addReader

        yield listener.tryConnection()
        try:
            self.assertThat(
                reactor.addReader,
                MockCalledOnceWith(listener))
        finally:
            yield listener.stopService()

    @wait_for_reactor
    @inlineCallbacks
    def test__tryConnection_closes_connection_on_failure(self):
        listener = PostgresListenerService()

        exc_type = factory.make_exception_type()
        startReading = self.patch(listener, "startReading")
        startReading.side_effect = exc_type("no reason")

        with ExpectedException(exc_type):
            yield listener.tryConnection()

        self.assertThat(listener.connection, Is(None))

    @wait_for_reactor
    @inlineCallbacks
    def test__tryConnection_logs_success(self):
        listener = PostgresListenerService()

        mock_logMsg = self.patch(listener, "logMsg")
        yield listener.tryConnection()
        try:
            self.assertThat(
                mock_logMsg,
                MockCalledOnceWith("Listening for database notifications."))
        finally:
            yield listener.stopService()

    @wait_for_reactor
    def test__connectionLost_logs_reason(self):
        listener = PostgresListenerService()
        self.patch(listener, "logErr")

        failure = Failure(factory.make_exception())

        listener.connectionLost(failure)

        self.assertThat(
            listener.logErr, MockCalledOnceWith(
                failure, "Connection lost."))

    @wait_for_reactor
    def test__connectionLost_does_not_log_reason_when_lost_cleanly(self):
        listener = PostgresListenerService()
        self.patch(listener, "logErr")

        listener.connectionLost(Failure(error.ConnectionDone()))

        self.assertThat(listener.logErr, MockNotCalled())

    def test_register_adds_channel_and_handler(self):
        listener = PostgresListenerService()
        channel = factory.make_name("channel")
        listener.register(channel, sentinel.handler)
        self.assertEqual(
            [sentinel.handler], listener.listeners[channel])

    def test__convertChannel_raises_exception_if_not_valid_channel(self):
        listener = PostgresListenerService()
        self.assertRaises(
            PostgresListenerNotifyError,
            listener.convertChannel, "node_create")

    def test__convertChannel_raises_exception_if_not_valid_action(self):
        listener = PostgresListenerService()
        self.assertRaises(
            PostgresListenerNotifyError,
            listener.convertChannel, "node_unknown")

    @wait_for_reactor
    @inlineCallbacks
    def test__doRead_removes_self_from_reactor_on_error(self):
        listener = PostgresListenerService()

        connection = self.patch(listener, "connection")
        connection.connection.poll.side_effect = OperationalError()

        self.patch(reactor, "removeReader")
        self.patch(listener, "connectionLost")

        failure = listener.doRead()

        # No failure is returned; see the comment in
        # PostgresListenerService.doRead() that explains why we don't do that.
        self.assertThat(failure, Is(None))

        # The listener has begun disconnecting.
        self.assertThat(listener.disconnecting, IsInstance(Deferred))
        # Wait for disconnection to complete.
        yield listener.disconnecting
        # The listener has removed itself from the reactor.
        self.assertThat(reactor.removeReader, MockCalledOnceWith(listener))
        # connectionLost() has been called with a simple ConnectionLost.
        self.assertThat(listener.connectionLost, MockCalledOnceWith(ANY))
        [failure] = listener.connectionLost.call_args[0]
        self.assertThat(failure, IsInstance(Failure))
        self.assertThat(failure.value, IsInstance(error.ConnectionLost))

    def test__doRead_adds_notifies_to_notifications(self):
        listener = PostgresListenerService()
        notifications = [
            FakeNotify(
                channel=factory.make_name("channel_action"),
                payload=factory.make_name("payload"))
            for _ in range(3)
            ]

        connection = self.patch(listener, "connection")
        connection.connection.poll.return_value = None
        # Add the notifications twice, so it can test that duplicates are
        # accumulated together.
        connection.connection.notifies = notifications + notifications
        self.patch(listener, "handleNotify")

        listener.doRead()
        self.assertItemsEqual(
            listener.notifications, set(notifications))

    @wait_for_reactor
    @inlineCallbacks
    def test__listener_ignores_ENOENT_when_removing_itself_from_reactor(self):
        listener = PostgresListenerService()

        self.patch(reactor, "addReader")
        self.patch(reactor, "removeReader")

        # removeReader() is going to have a nasty accident.
        enoent = IOError("ENOENT")
        enoent.errno = errno.ENOENT
        reactor.removeReader.side_effect = enoent

        # The listener starts and stops without issue.
        yield listener.startService()
        yield listener.stopService()

        # addReader() and removeReader() were both called.
        self.assertThat(reactor.addReader, MockCalledOnceWith(listener))
        self.assertThat(reactor.removeReader, MockCalledOnceWith(listener))

    @wait_for_reactor
    @inlineCallbacks
    def test__listener_waits_for_notifier_to_complete(self):
        listener = PostgresListenerService()

        yield listener.startService()
        try:
            self.assertTrue(listener.notifier.running)
        finally:
            yield listener.stopService()
            self.assertFalse(listener.notifier.running)
