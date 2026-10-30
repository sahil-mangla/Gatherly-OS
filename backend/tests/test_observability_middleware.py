"""Correlation ids, access logging, error path and path normalisation of the middleware."""

import logging
import re

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.observability.middleware import (
    ObservabilityMiddleware,
    normalize_path,
    safe_id,
)


@pytest.fixture
def probe_client():
    probe = FastAPI()
    probe.add_middleware(ObservabilityMiddleware)

    @probe.get("/api/ping")
    def ping():
        return {"pong": True}

    @probe.get("/src/js/app.js")
    def asset():
        return {"asset": True}

    @probe.get("/api/boom")
    def boom():
        raise RuntimeError("kaboom secret-detail")

    return TestClient(probe, raise_server_exceptions=False)


@pytest.fixture
def gatherly_logs(caplog):
    caplog.set_level(logging.INFO, logger="gatherly")
    return caplog


def access_records(caplog):
    return [r for r in caplog.records if r.name == "gatherly" and hasattr(r, "http_method")]


@pytest.mark.parametrize("value", ["abc-123", "a.b_c-9", "x" * 64])
def test_safe_client_ids_are_echoed(probe_client, value):
    assert (
        probe_client.get("/api/ping", headers={"X-Correlation-ID": value}).headers[
            "x-correlation-id"
        ]
        == value
    )


@pytest.mark.parametrize("value", ["has space", "x" * 65, "semi;colon", "<script>", "a/b"])
def test_unsafe_correlation_ids_are_regenerated(probe_client, value):
    echoed = probe_client.get("/api/ping", headers={"X-Correlation-ID": value}).headers[
        "x-correlation-id"
    ]
    assert echoed != value and re.fullmatch(r"corr-[0-9a-f]{12}", echoed)


def test_missing_correlation_id_is_generated(probe_client):
    echoed = probe_client.get("/api/ping").headers["x-correlation-id"]
    assert re.fullmatch(r"corr-[0-9a-f]{12}", echoed)


@pytest.mark.parametrize(
    "header,expected",
    [("tenant-ok_1", "tenant-ok_1"), ("bad tenant\t", "unknown"), ("t" * 65, "unknown")],
)
def test_tenant_header_is_sanitised_in_logs(probe_client, gatherly_logs, header, expected):
    probe_client.get("/api/ping", headers={"X-Tenant-ID": header})
    assert access_records(gatherly_logs)[-1].tenant_id == expected


def test_access_log_records_path_without_query_string(probe_client, gatherly_logs):
    probe_client.get("/api/ping?token=SECRET123&x=1")
    record = access_records(gatherly_logs)[-1]
    assert (record.http_method, record.path, record.status_code) == ("GET", "/api/ping", 200)
    assert "SECRET123" not in record.getMessage() and "token" not in record.getMessage()
    assert record.levelno == logging.INFO and record.duration_ms >= 0


def test_client_errors_are_logged_as_warnings(probe_client, gatherly_logs):
    probe_client.get("/api/missing")
    record = access_records(gatherly_logs)[-1]
    assert (record.status_code, record.levelno) == (404, logging.WARNING)


def test_static_asset_requests_are_not_logged(probe_client, gatherly_logs):
    assert probe_client.get("/src/js/app.js").status_code == 200
    assert access_records(gatherly_logs) == []


def test_unhandled_exception_is_logged_with_ids_and_returns_500(probe_client, gatherly_logs):
    res = probe_client.get("/api/boom?q=1", headers={"X-Correlation-ID": "req-500"})
    assert res.status_code == 500
    assert "secret-detail" not in res.text
    record = access_records(gatherly_logs)[-1]
    assert (record.levelno, record.status_code, record.correlation_id) == (
        logging.ERROR,
        500,
        "req-500",
    )
    assert record.path == "/api/boom" and record.exc_info[0] is RuntimeError


def test_unhandled_exception_response_is_json_with_the_request_id(probe_client):
    res = probe_client.get("/api/boom", headers={"X-Correlation-ID": "req-500"})
    assert res.status_code == 500
    assert res.headers["content-type"].startswith("application/json")
    assert res.headers["x-correlation-id"] == "req-500"
    assert res.json() == {"detail": "Internal server error."}


@pytest.mark.parametrize(
    "path,expected",
    [
        ("/api/index.py", "/api/health"),
        ("/api/index.py/events/e1", "/api/events/e1"),
        ("/health", "/api/health"),
        ("/events/e1", "/api/events/e1"),
        ("/auth/login", "/api/auth/login"),
        ("/mara", "/api/mara"),
        ("/vendors/compare", "/api/vendors/compare"),
        ("/simulate", "/api/simulate"),
        ("/api/events", "/api/events"),
        ("/index.html", "/index.html"),
        ("/eventsfoo", "/eventsfoo"),
        ("/events.html", "/events.html"),
        ("/authors/readme", "/authors/readme"),
        ("/healthy", "/healthy"),
    ],
)
def test_serverless_path_normalisation(path, expected):
    assert normalize_path(path) == expected


@pytest.mark.parametrize(
    "value,expected", [(None, "fb"), ("", "fb"), ("ok-1", "ok-1"), ("no good", "fb")]
)
def test_safe_id(value, expected):
    assert safe_id(value, "fb") == expected
