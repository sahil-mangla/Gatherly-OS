"""HTTP hardening: docs exposure, security headers, CORS and request size limits."""

import pytest
from fastapi.testclient import TestClient

DOC_URLS = ["/docs", "/redoc", "/openapi.json"]
ORIGIN = "https://app.gatherly.example"


@pytest.mark.parametrize("url", DOC_URLS)
def test_docs_are_served_outside_production(client, url):
    assert client.get(url).status_code == 200


@pytest.mark.parametrize("url", DOC_URLS)
def test_docs_are_not_exposed_in_production(build_app, url):
    app = build_app(environment="production")
    assert TestClient(app).get(url).status_code == 404


def test_api_still_works_in_a_production_build(build_app, auth_headers):
    prod = TestClient(build_app(environment="production"))
    assert prod.get("/api/health").json()["status"] == "ok"
    assert prod.get("/api/auth/me", headers=auth_headers("planner")).status_code == 200


def test_security_headers_on_api_responses(client):
    res = client.get("/api/health")
    assert res.headers["x-content-type-options"] == "nosniff"
    assert res.headers["x-frame-options"] == "DENY"
    assert res.headers["referrer-policy"] == "strict-origin-when-cross-origin"
    assert (
        res.headers["permissions-policy"] == "camera=(), microphone=(), geolocation=(), payment=()"
    )
    assert res.headers["cache-control"] == "no-store"
    assert "frame-ancestors 'none'" in res.headers["content-security-policy"]
    assert "script-src 'self'" in res.headers["content-security-policy"]


def test_error_responses_also_carry_security_headers(client):
    res = client.get("/api/events/missing-id")
    assert res.status_code == 404
    assert res.headers["x-frame-options"] == "DENY"
    assert "content-security-policy" in res.headers


def test_hsts_only_in_production(client, production_mode):
    prod = client.get("/api/health")
    assert prod.headers["strict-transport-security"] == "max-age=31536000; includeSubDomains"
    production_mode.environment = "development"
    assert "strict-transport-security" not in client.get("/api/health").headers


def test_swagger_pages_skip_csp_but_keep_other_headers(client):
    res = client.get("/docs")
    assert "content-security-policy" not in res.headers
    assert res.headers["x-frame-options"] == "DENY"


def test_wildcard_cors_never_allows_credentials(client):
    res = client.get("/api/health", headers={"Origin": "https://anything.example"})
    assert res.headers["access-control-allow-origin"] == "*"
    assert "access-control-allow-credentials" not in res.headers


def test_explicit_origin_is_reflected_and_unknown_is_not(build_app):
    app = build_app(cors_origins=[ORIGIN])
    client = TestClient(app)
    good = client.get("/api/health", headers={"Origin": ORIGIN})
    assert good.headers["access-control-allow-origin"] == ORIGIN
    assert good.headers["access-control-allow-credentials"] == "true"
    bad = client.get("/api/health", headers={"Origin": "https://evil.example"})
    assert "access-control-allow-origin" not in bad.headers
    assert bad.status_code == 200


def test_preflight_lists_only_the_expected_methods_and_headers(build_app):
    client = TestClient(build_app(cors_origins=[ORIGIN]))
    res = client.options(
        "/api/events",
        headers={
            "Origin": ORIGIN,
            "Access-Control-Request-Method": "DELETE",
            "Access-Control-Request-Headers": "Authorization",
        },
    )
    assert res.status_code == 200
    assert res.headers["access-control-allow-origin"] == ORIGIN
    assert set(res.headers["access-control-allow-methods"].split(", ")) == {
        "GET",
        "POST",
        "PUT",
        "DELETE",
        "OPTIONS",
    }


def test_no_configured_origins_means_same_origin_only(build_app):
    client = TestClient(build_app(environment="production", cors_origins=[]))
    res = client.get("/api/health", headers={"Origin": ORIGIN})
    assert "access-control-allow-origin" not in res.headers


def test_body_over_1mb_is_rejected_with_413(client, auth_headers):
    body = b'{"prompt":"' + b"x" * 1_048_577 + b'"}'
    res = client.post(
        "/api/mara", content=body, headers={**auth_headers(), "content-type": "application/json"}
    )
    assert res.status_code == 413
    assert res.json() == {"detail": "Request body too large."}


def chunked_megabytes():
    for _ in range(3):
        yield b"x" * 524_288


def test_chunked_body_over_1mb_is_never_processed(client, auth_headers):
    res = client.post("/api/mara", content=chunked_megabytes(), headers=auth_headers())
    assert res.status_code == 413
    assert "success" not in res.json()


def test_chunked_body_over_1mb_is_413(client, auth_headers):
    res = client.post("/api/mara", content=chunked_megabytes(), headers=auth_headers())
    assert res.status_code == 413


def test_body_at_the_limit_is_not_rejected_for_size(client, auth_headers):
    body = b'{"prompt":"' + b"x" * (1_048_576 - 13) + b'"}'
    assert len(body) == 1_048_576
    res = client.post(
        "/api/mara", content=body, headers={**auth_headers(), "content-type": "application/json"}
    )
    assert res.status_code == 422  # accepted by the size gate; rejected by prompt max_length
