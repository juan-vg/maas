from maastesting.testcase import MAASTestCase
from provisioningserver.prometheus.utils import (
    create_metrics,
    MetricDefinition,
)
from provisioningserver.rackdservices import http
from twisted.web.server import Request
from twisted.web.test.test_web import DummyChannel


class TestPrometheusMetricsResource(MAASTestCase):

    def setUp(self):
        super().setUp()
        self.metrics_definitions = [
            MetricDefinition(
                'Histogram', 'sample_histogram', 'Sample histogram', []),
            MetricDefinition(
                'Counter', 'sample_counter', 'Sample counter', [])]

    def test_metrics(self):
        prometheus_metrics = create_metrics(self.metrics_definitions)
        resource = http.PrometheusMetricsResource(prometheus_metrics)
        request = Request(DummyChannel(), False)
        content = resource.render_GET(request).decode('utf-8')
        self.assertIn('TYPE sample_histogram histogram', content)
        self.assertIn('TYPE sample_counter counter', content)
