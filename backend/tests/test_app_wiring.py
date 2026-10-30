"""App assembly: static file caching, logging setup and registration edge cases."""

import logging

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.main import CachedStaticFiles
from app.observability.logging import JsonLogFormatter, configure_logging

ORG = {"full_name": "Slug Tester", "password": "password-123"}


@pytest.fixture
def static_client(tmp_path):
    for name in ("index.html", "app.js", "style.css", "logo.svg", "notes.txt", "font.woff2"):
        (tmp_path / name).write_text("x")
    site = FastAPI()
    site.mount("/", CachedStaticFiles(directory=str(tmp_path), html=True))
    return TestClient(site)


@pytest.mark.parametrize(
    "path,cache",
    [
        ("/", "no-cache"),
        ("/index.html", "no-cache"),
        ("/notes.txt", "no-cache"),
        ("/app.js", "public, max-age=3600"),
        ("/style.css", "public, max-age=3600"),
        ("/logo.svg", "public, max-age=3600"),
        ("/font.woff2", "public, max-age=3600"),
    ],
)
def test_static_cache_policy(static_client, path, cache):
    res = static_client.get(path)
    assert (res.status_code, res.headers["cache-control"]) == (200, cache)


def test_real_app_serves_the_frontend_shell_with_revalidation(client):
    res = client.get("/")
    assert res.status_code == 200 and "text/html" in res.headers["content-type"]
    assert res.headers["cache-control"] == "no-cache"


def test_root_health_probe_is_routed_to_the_api_health_endpoint(client):
    assert client.get("/health").json() == {
        "status": "ok",
        "service": "gatherly-backend",
        "version": "1.0.0",
    }


@pytest.fixture
def pristine_logging():
    root = logging.getLogger()
    handlers, level = root.handlers[:], root.level
    yield root
    root.handlers[:] = handlers
    root.setLevel(level)


@pytest.mark.parametrize(
    "log_format,debug,formatter_type,level",
    [
        ("json", False, JsonLogFormatter, logging.INFO),
        ("JSON", True, JsonLogFormatter, logging.DEBUG),
        ("text", False, logging.Formatter, logging.INFO),
    ],
)
def test_configure_logging_formats(
    pristine_logging, settings, monkeypatch, log_format, debug, formatter_type, level
):
    monkeypatch.setattr(settings, "log_format", log_format)
    monkeypatch.setattr(settings, "debug", debug)
    configure_logging()
    (handler,) = pristine_logging.handlers
    assert type(handler.formatter) is formatter_type
    assert pristine_logging.level == level


def test_text_log_format_is_human_readable(pristine_logging, settings, monkeypatch):
    monkeypatch.setattr(settings, "log_format", "text")
    configure_logging()
    record = logging.LogRecord("n", logging.WARNING, "f", 1, "hello %s", ("w",), None)
    assert pristine_logging.handlers[0].format(record).endswith("[WARNING] [n]: hello w")


def register(client, org, email):
    return client.post("/api/auth/register", json={**ORG, "organization_name": org, "email": email})


def test_duplicate_organisation_names_get_unique_slugs(client):
    first = register(client, "Slug Co", "slug-1@example.com")
    second = register(client, "Slug Co", "slug-2@example.com")
    assert first.status_code == second.status_code == 200
    assert first.json()["tenant_id"] != second.json()["tenant_id"]


def test_registration_race_on_commit_is_a_clean_409(client, monkeypatch):
    def conflict(self):
        raise IntegrityError("INSERT", {}, Exception("unique"))

    monkeypatch.setattr(Session, "commit", conflict)
    res = register(client, "Race Org", "race@example.com")
    assert res.status_code == 409
    assert res.json() == {"detail": "A user with this email address already exists."}
