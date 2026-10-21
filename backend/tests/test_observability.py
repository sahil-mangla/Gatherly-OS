"""Automated tests for distributed tracing, correlation IDs, and structured JSON logging."""

import json
import logging

import pytest
from backend.app.main import app
from backend.app.observability.logging import JsonLogFormatter
from backend.app.observability.telemetry import get_tracer, trace_span
from fastapi.testclient import TestClient


@pytest.fixture
def client():
    return TestClient(app)


def test_correlation_id_middleware(client):
    """Verify X-Correlation-ID header propagation across HTTP requests."""
    # Custom client correlation ID
    res = client.get("/api/health", headers={"X-Correlation-ID": "test-corr-999"})
    assert res.status_code == 200
    assert res.headers["X-Correlation-ID"] == "test-corr-999"

    # Server-generated correlation ID if omitted
    res_auto = client.get("/api/health")
    assert res_auto.status_code == 200
    assert "X-Correlation-ID" in res_auto.headers
    assert res_auto.headers["X-Correlation-ID"].startswith("corr-")


def test_opentelemetry_span_context():
    """Verify custom trace span execution and attribute recording."""
    tracer = get_tracer()
    assert tracer is not None

    with trace_span(
        "simulate_ripple_calculation", {"guest_delta": 25, "is_critical": True}
    ) as span:
        assert span is not None


def test_json_log_formatter():
    """Verify log output complies with single-line JSON format for Datadog / CloudWatch."""
    formatter = JsonLogFormatter()
    record = logging.LogRecord(
        name="gatherly.test",
        level=logging.INFO,
        pathname="test.py",
        lineno=10,
        msg="Transaction approved and applied",
        args=(),
        exc_info=None,
    )
    record.correlation_id = "corr-test-123"
    record.tenant_id = "tenant-test"
    record.http_method = "POST"
    record.path = "/api/events"
    record.status_code = 201
    record.duration_ms = 14.5

    formatted = formatter.format(record)
    parsed = json.loads(formatted)

    assert parsed["level"] == "INFO"
    assert parsed["message"] == "Transaction approved and applied"
    assert parsed["correlation_id"] == "corr-test-123"
    assert parsed["tenant_id"] == "tenant-test"
    assert parsed["http_method"] == "POST"
    assert parsed["status_code"] == 201
    assert parsed["duration_ms"] == 14.5
    assert "timestamp" in parsed
