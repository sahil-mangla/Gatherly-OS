"""Demo tokens, seeded admin login policy and uniform login failures."""

import pytest

from app.auth import routes as auth_routes
from app.auth.security import decode_access_token
from app.db.seed import DEMO_TENANT_ID, seed_database

SEED_LOGIN = {"email": "planner@gatherly.app", "password": "gatherly2026"}
ROLES = ["owner", "planner", "vendor", "collaborator"]


@pytest.mark.parametrize("role", ROLES)
def test_demo_token_is_scoped_to_the_demo_tenant(client, role):
    res = client.get("/api/auth/demo-token", params={"role": role})
    assert res.status_code == 200
    body = res.json()
    claims = decode_access_token(body["access_token"])
    assert (body["tenant_id"], body["role"]) == (DEMO_TENANT_ID, role)
    assert (claims["tenant_id"], claims["role"], claims["sub"]) == (
        DEMO_TENANT_ID,
        role,
        "user-demo-planner",
    )


def test_demo_token_defaults_to_owner(client):
    assert client.get("/api/auth/demo-token").json()["role"] == "owner"


@pytest.mark.parametrize("role", ["admin", "root", "", "OWNER"])
def test_demo_token_rejects_unknown_roles(client, role):
    res = client.get("/api/auth/demo-token", params={"role": role})
    assert res.status_code == 422
    assert res.json()["detail"][0]["loc"] == ["query", "role"]


def test_demo_token_is_disabled_when_demo_mode_is_off(client, settings, monkeypatch):
    monkeypatch.setattr(settings, "demo_mode", False)
    res = client.get("/api/auth/demo-token")
    assert (res.status_code, res.json()) == (404, {"detail": "Not found."})


def test_demo_token_cannot_read_other_tenants(client):
    token = client.get("/api/auth/demo-token", params={"role": "owner"}).json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    ids = [e["id"] for e in client.get("/api/events", headers=headers).json()]
    assert "demo-wedding-leila-noor" in ids and "wedding-leila-noor" not in ids
    assert client.get("/api/events/wedding-leila-noor", headers=headers).status_code == 404


def test_seeded_admin_can_log_in_outside_production(client):
    res = client.post("/api/auth/login", json=SEED_LOGIN)
    assert res.status_code == 200
    body = res.json()
    assert (body["tenant_id"], body["role"], body["email"]) == (
        "tenant-default",
        "owner",
        "planner@gatherly.app",
    )


def test_login_email_is_case_insensitive(client):
    res = client.post("/api/auth/login", json={**SEED_LOGIN, "email": "Planner@Gatherly.APP"})
    assert res.status_code == 200


def test_production_does_not_seed_the_default_admin_without_a_password(
    isolated_client, production_mode, db_session
):
    seed_database(db_session)
    assert isolated_client.post("/api/auth/login", json=SEED_LOGIN).status_code == 401


def test_production_seeds_admin_only_with_the_configured_password(
    isolated_client, production_mode, db_session, monkeypatch
):
    monkeypatch.setattr(production_mode, "seed_admin_password", "Prod-Only-Secret-1")
    seed_database(db_session)
    ok = isolated_client.post(
        "/api/auth/login", json={**SEED_LOGIN, "password": "Prod-Only-Secret-1"}
    )
    dev_default = isolated_client.post("/api/auth/login", json=SEED_LOGIN)
    assert (ok.status_code, dev_default.status_code) == (200, 401)


def test_unknown_email_and_wrong_password_are_indistinguishable(client):
    unknown = client.post(
        "/api/auth/login", json={"email": "nobody@example.com", "password": "whatever1"}
    )
    wrong = client.post("/api/auth/login", json={**SEED_LOGIN, "password": "not-the-password"})
    assert unknown.status_code == wrong.status_code == 401
    assert unknown.json() == wrong.json() == {"detail": "Invalid email or password."}
    assert unknown.headers["www-authenticate"] == wrong.headers["www-authenticate"] == "Bearer"


def test_unknown_email_still_burns_a_password_check(client, monkeypatch):
    burned = []
    monkeypatch.setattr(auth_routes, "burn_password_check", burned.append)
    client.post("/api/auth/login", json={"email": "ghost@example.com", "password": "pw-ghost-1"})
    client.post("/api/auth/login", json={**SEED_LOGIN, "password": "wrong-password"})
    assert burned == ["pw-ghost-1"]


def test_duplicate_registration_is_a_409(client, second_tenant):
    res = client.post(
        "/api/auth/register",
        json={
            "organization_name": "Dup Org",
            "full_name": "Dup User",
            "email": second_tenant["email"].upper(),
            "password": "password-123",
        },
    )
    assert res.status_code == 409, res.text
    assert res.json() == {"detail": "A user with this email address already exists."}


def test_me_reports_the_account_email(client, second_tenant):
    me = client.get("/api/auth/me", headers=second_tenant["headers"]).json()
    assert me["email"] == second_tenant["email"]
