"""Seed idempotence plus API-level paging and audit-trail guarantees."""

import pytest
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError

from app.db import seed
from app.db.database import SessionLocal, init_db
from app.db.models import AuditLog, EventModel, Tenant, User
from app.db.seed import DEFAULT_TENANT_ID, DEMO_TENANT_ID, ensure_demo_tenant, seed_database

from .db_fixtures import seed_events


def counts(session):
    return tuple(session.query(func.count(m.id)).scalar() for m in (Tenant, User, EventModel))


def test_seeding_twice_creates_nothing_new(db_session):
    seed_database(db_session)
    first = counts(db_session)
    seed_database(db_session)
    assert first == (2, 1, 2)
    assert counts(db_session) == first


def test_init_db_is_idempotent_against_the_shared_database():
    def snapshot():
        with SessionLocal() as session:
            admins = session.query(User).filter_by(email="planner@gatherly.app").count()
            wedding = session.query(EventModel).filter_by(id="wedding-leila-noor").count()
            return admins, wedding, session.get(Tenant, DEMO_TENANT_ID) is not None

    init_db()
    first = snapshot()
    init_db()
    assert first == (1, 1, True) and snapshot() == first


def test_demo_tenant_has_no_users_and_one_sample_event(db_session):
    ensure_demo_tenant(db_session)
    ensure_demo_tenant(db_session)
    assert db_session.query(User).filter_by(tenant_id=DEMO_TENANT_ID).count() == 0
    events = db_session.query(EventModel).filter_by(tenant_id=DEMO_TENANT_ID).all()
    assert [e.id for e in events] == ["demo-wedding-leila-noor"]


def test_demo_tenant_is_skipped_when_demo_mode_is_off(db_session, settings, monkeypatch):
    monkeypatch.setattr(settings, "demo_mode", False)
    seed_database(db_session)
    assert [t.id for t in db_session.query(Tenant).all()] == [DEFAULT_TENANT_ID]


def test_concurrent_seed_race_is_swallowed(db_session, monkeypatch, caplog):
    rolled_back = []

    def conflict():
        raise IntegrityError("INSERT", {}, Exception("duplicate"))

    monkeypatch.setattr(db_session, "commit", conflict)
    monkeypatch.setattr(db_session, "rollback", lambda: rolled_back.append(True))
    with caplog.at_level("INFO", logger="gatherly.db"):
        ensure_demo_tenant(db_session)
    assert rolled_back == [True] and "already created by another worker" in caplog.text


def test_seed_policy_prefers_the_configured_password(db_session, settings, monkeypatch):
    monkeypatch.setattr(settings, "seed_admin_password", "Configured-Pass-9")
    seed._seed_default_tenant(db_session)
    admin = db_session.get(User, "user-admin-1")
    assert admin.role == "owner" and admin.email == "planner@gatherly.app"
    assert (
        admin.password_hash.startswith("pbkdf2_sha256$")
        and "Configured-Pass-9" not in admin.password_hash
    )


def test_api_list_defaults_to_50_and_honours_limit_and_offset(
    isolated_client, db_session, auth_headers
):
    seed_events(db_session, "tenant-page", 105)
    headers = auth_headers("vendor", "tenant-page")

    def ids(query=""):
        return [e["id"] for e in isolated_client.get(f"/api/events{query}", headers=headers).json()]

    assert len(ids()) == 50 and ids()[0] == "tenant-page-e0104"
    assert len(ids("?limit=500")) == 105
    assert ids("?limit=5&offset=100") == [f"tenant-page-e{i:04d}" for i in range(4, -1, -1)]


def test_api_mutations_leave_an_audit_trail(isolated_client, db_session, auth_headers):
    tenant = "tenant-audit-api"
    created = isolated_client.post(
        "/api/events", headers=auth_headers("planner", tenant, "u-planner"), json={"name": "Trail"}
    ).json()
    url = f"/api/events/{created['id']}"
    isolated_client.put(
        url, headers=auth_headers("collaborator", tenant, "u-collab"), json={"theme": "x"}
    )
    isolated_client.delete(url, headers=auth_headers("owner", tenant, "u-owner"))
    trail = db_session.query(AuditLog).order_by(AuditLog.created_at).all()
    assert [(a.action, a.user_id) for a in trail] == [
        ("create", "u-planner"),
        ("update", "u-collab"),
        ("delete", "u-owner"),
    ]
    assert {a.tenant_id for a in trail} == {tenant} and {a.resource_id for a in trail} == {
        created["id"]
    }


def test_denied_and_missing_requests_write_no_audit_rows(isolated_client, db_session, auth_headers):
    tenant = "tenant-audit-none"
    isolated_client.post("/api/events", headers=auth_headers("vendor", tenant), json={"name": "x"})
    isolated_client.put(
        "/api/events/nope", headers=auth_headers("owner", tenant), json={"name": "x"}
    )
    isolated_client.delete("/api/events/nope", headers=auth_headers("owner", tenant))
    assert db_session.query(AuditLog).count() == 0


def test_api_null_for_non_nullable_field_is_ignored_but_date_can_be_cleared(
    isolated_client, auth_headers
):
    headers = auth_headers("owner", "tenant-null")
    created = isolated_client.post(
        "/api/events", headers=headers, json={"name": "Keep", "date": "2026-06-06", "theme": "t"}
    ).json()
    res = isolated_client.put(
        f"/api/events/{created['id']}",
        headers=headers,
        json={"name": None, "date": None, "theme": None},
    ).json()
    assert (res["name"], res["date"], res["theme"]) == ("Keep", None, None)


@pytest.mark.parametrize("event_id", ["a/b", "x y"])
def test_ids_with_path_or_space_characters_are_never_found(isolated_client, auth_headers, event_id):
    res = isolated_client.get(f"/api/events/{event_id}", headers=auth_headers())
    assert res.status_code == 404
