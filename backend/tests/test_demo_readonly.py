"""Demo sessions are read-only for events; compute endpoints and reads keep working."""

from datetime import UTC, datetime, timedelta

import jwt
import pytest
from fastapi import HTTPException

from app.auth.dependencies import AuthContext, require_role
from app.auth.security import JWT_ISSUER, create_access_token, decode_access_token
from app.db.seed import DEMO_TENANT_ID

from .conftest import ROLES, TEST_JWT_SECRET

READ_ONLY = {"detail": "Demo sessions are read-only."}
DEMO_EVENT = "demo-wedding-leila-noor"


@pytest.fixture
def demo_headers(client):
    def headers(role="owner"):
        res = client.get("/api/auth/demo-token", params={"role": role})
        assert res.status_code == 200
        return {"Authorization": f"Bearer {res.json()['access_token']}"}

    return headers


def hand_made(**extra):
    now = datetime.now(UTC)
    claims = {
        "sub": "u-x",
        "tenant_id": "tenant-x",
        "role": "owner",
        "iat": now,
        "exp": now + timedelta(minutes=5),
        "iss": JWT_ISSUER,
        **extra,
    }
    return jwt.encode(claims, TEST_JWT_SECRET, algorithm="HS256")


def test_demo_token_carries_a_true_demo_claim_and_normal_tokens_do_not(client):
    demo = client.get("/api/auth/demo-token").json()["access_token"]
    assert decode_access_token(demo)["demo"] is True
    assert "demo" not in decode_access_token(create_access_token("u", "t"))
    assert create_access_token("u", "t", demo=False) != create_access_token("u", "t", demo=True)


@pytest.mark.parametrize("value", ["yes", 1, "true", None, [], {}])
def test_non_boolean_demo_claims_are_rejected(client, value):
    with pytest.raises(ValueError):
        decode_access_token(hand_made(demo=value))
    res = client.get("/api/auth/me", headers={"Authorization": f"Bearer {hand_made(demo=value)}"})
    assert res.status_code == 401


def test_an_explicit_false_demo_claim_is_a_normal_session(client):
    headers = {"Authorization": f"Bearer {hand_made(demo=False)}"}
    assert client.post("/api/events", headers=headers, json={"name": "Ok"}).status_code == 201
    assert client.get("/api/auth/me", headers=headers).json()["is_demo"] is False


def test_me_reports_whether_the_session_is_a_demo(client, demo_headers, auth_headers):
    assert client.get("/api/auth/me", headers=demo_headers()).json()["is_demo"] is True
    assert client.get("/api/auth/me", headers=auth_headers()).json()["is_demo"] is False


@pytest.mark.parametrize("role", ROLES)
def test_demo_sessions_cannot_create_update_or_delete(client, demo_headers, role):
    headers = demo_headers(role)
    attempts = {
        "POST": ("/api/events", {"name": "Vandal"}),
        "PUT": (f"/api/events/{DEMO_EVENT}", {"name": "Vandalised"}),
        "DELETE": (f"/api/events/{DEMO_EVENT}", None),
    }
    for method, (path, body) in attempts.items():
        res = client.request(method, path, headers=headers, json=body)
        assert (res.status_code, res.json()) == (403, READ_ONLY), method
    events = client.get("/api/events", headers=headers).json()
    assert [(e["id"], e["name"]) for e in events] == [(DEMO_EVENT, "Leila & Noor")]


def test_demo_sessions_can_read_the_shared_event(client, demo_headers):
    headers = demo_headers("owner")
    assert client.get("/api/events", headers=headers).status_code == 200
    res = client.get(f"/api/events/{DEMO_EVENT}", headers=headers)
    assert (res.status_code, res.json()["tenant_id"]) == (200, DEMO_TENANT_ID)


COMPUTE = [
    ("/api/mara", {}),
    ("/api/simulate", {"event": {"total_budget": 1000}}),
    ("/api/risks", {"event": {}}),
    ("/api/vendors/compare", {"quotes": []}),
    ("/api/vendors/parse-seed", {"text": "$5"}),
]


@pytest.mark.parametrize("path,body", COMPUTE)
def test_compute_endpoints_work_for_demo_sessions(client, demo_headers, path, body):
    assert client.post(path, headers=demo_headers("vendor"), json=body).status_code == 200


def test_demo_check_precedes_the_role_check(client, demo_headers):
    res = client.post("/api/events", headers=demo_headers("vendor"), json={"name": "x"})
    assert (res.status_code, res.json()) == (403, READ_ONLY)


def test_non_demo_tokens_for_the_same_roles_are_unaffected(client, auth_headers):
    headers = auth_headers("planner")
    created = client.post("/api/events", headers=headers, json={"name": "Real"})
    assert created.status_code == 201
    assert (
        client.put(f"/api/events/{created.json()['id']}", headers=headers, json={}).status_code
        == 200
    )


def test_owner_bypasses_every_role_requirement_by_design():
    owner = AuthContext("u", "t", "owner")
    assert owner.has_role("planner") and owner.has_role() and owner.has_role("vendor", "planner")
    planner = AuthContext("u", "t", "planner")
    assert planner.has_role("planner") and not planner.has_role("owner", "vendor")
    assert not AuthContext("u", "t", "vendor").has_role("planner")


def test_require_role_planner_accepts_an_owner_but_not_a_vendor():
    check = require_role("planner")
    owner = AuthContext("u", "t", "owner")
    assert check(owner) is owner
    with pytest.raises(HTTPException) as caught:
        check(AuthContext("u", "t", "vendor"))
    assert caught.value.status_code == 403


def test_require_role_planner_over_http_accepts_owner(client, auth_headers):
    res = client.post("/api/events", headers=auth_headers("owner"), json={"name": "By owner"})
    assert res.status_code == 201
