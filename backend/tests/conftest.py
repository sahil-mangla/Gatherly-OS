"""Shared pytest setup: isolated temp DB and test environment, one app instance, token helpers.

The environment is configured at import time, before any ``app.*`` module is imported, because
``app.config`` reads it once and ``app.db.database`` binds its engine immediately.
"""

import atexit
import os
import shutil
import tempfile
import uuid

import pytest

from .app_factory import build_app  # noqa: F401
from .db_fixtures import db_session, fresh_db, isolated_client  # noqa: F401
from .mara_fixtures import forbid_network, live_gemini  # noqa: F401

_TMP_DIR = tempfile.mkdtemp(prefix="gatherly-tests-")
atexit.register(shutil.rmtree, _TMP_DIR, ignore_errors=True)

TEST_JWT_SECRET = "pytest-signing-secret-0123456789-abcdefghijklmnop"
# Explicit (even empty) values also stop python-dotenv from importing a developer's .env.
os.environ.update(
    {
        "ENVIRONMENT": "test",
        "DATABASE_URL": f"sqlite:///{_TMP_DIR}/gatherly-test.db",
        "JWT_SECRET": TEST_JWT_SECRET,
        "RATE_LIMIT_ENABLED": "false",
        "PBKDF2_ITERATIONS": "1000",
        "GEMINI_API_KEY": "",
        "LLM_API_KEY": "",
        "VERCEL": "",
        "SEED_ADMIN_PASSWORD": "",
        "CORS_ORIGINS": "",
        "DEMO_MODE": "true",
        "TRUST_PROXY": "false",
        "DEBUG": "false",
        "JWT_EXPIRATION_MINUTES": "1440",
        "OTEL_ENABLED": "true",
    }
)

ROLES = ("owner", "planner", "collaborator", "vendor")


def new_tenant_id() -> str:
    return f"tenant-t-{uuid.uuid4().hex[:10]}"


@pytest.fixture(scope="session")
def asgi_app():
    from app.main import app

    return app


@pytest.fixture
def client(asgi_app):
    from fastapi.testclient import TestClient

    return TestClient(asgi_app)


@pytest.fixture(autouse=True)
def _clean_process_state():
    """Reset process-wide rate-limit and Mara cache state so tests stay order-independent."""
    from app.api.rate_limit import limiter
    from app.services import mara_service

    limiter.reset()
    mara_service._cache.clear()
    yield
    limiter.reset()
    mara_service._cache.clear()


@pytest.fixture
def settings():
    from app.config import settings as app_settings

    return app_settings


@pytest.fixture
def production_mode(monkeypatch, settings):
    """Flip the live settings object to production (read at request time by the app)."""
    monkeypatch.setattr(settings, "environment", "production")
    return settings


@pytest.fixture
def rate_limiting(monkeypatch, settings):
    monkeypatch.setattr(settings, "rate_limit_enabled", True)
    return settings


@pytest.fixture
def tenant_id():
    return new_tenant_id()


@pytest.fixture
def make_token():
    """Return ``make(role, tenant_id, user_id)`` minting JWTs with the app's own helper."""
    from app.auth.security import create_access_token

    def make(role="owner", tenant=None, user_id=None):
        return create_access_token(user_id or f"u-{role}", tenant or new_tenant_id(), role=role)

    return make


@pytest.fixture
def auth_headers(make_token):
    """Return ``headers(role, tenant_id, user_id)`` giving a Bearer authorization header."""

    def headers(role="owner", tenant=None, user_id=None):
        return {"Authorization": f"Bearer {make_token(role, tenant, user_id)}"}

    return headers


@pytest.fixture
def second_tenant(client):
    """A genuinely registered, separate organisation: its id and an owner auth header."""
    uid = uuid.uuid4().hex[:8]
    res = client.post(
        "/api/auth/register",
        json={
            "organization_name": f"Second Org {uid}",
            "full_name": "Second Owner",
            "email": f"second-{uid}@example.com",
            "password": "second-owner-pass",
        },
    )
    assert res.status_code == 200
    body = res.json()
    return {
        "email": body["email"],
        "tenant_id": body["tenant_id"],
        "headers": {"Authorization": f"Bearer {body['access_token']}"},
    }


@pytest.fixture
def make_event(client):
    """Return ``make(headers, **fields)`` creating an event via the API and returning its JSON."""

    def make(headers, **fields):
        body = {"name": "Fixture Event", **fields}
        res = client.post("/api/events", headers=headers, json=body)
        assert res.status_code == 201, res.text
        return res.json()

    return make
