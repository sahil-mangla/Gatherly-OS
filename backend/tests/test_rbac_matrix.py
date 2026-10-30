"""Role x endpoint authorisation matrix with exact allowed/denied statuses and side effects."""

import pytest

from .conftest import ROLES

ALL = frozenset(ROLES)
WRITERS = frozenset({"owner", "planner"})
EDITORS = frozenset({"owner", "planner", "collaborator"})
OWNER_ONLY = frozenset({"owner"})
FORBIDDEN = "Forbidden: insufficient permissions for this operation."

# (method, path template, json body, roles allowed, status when allowed)
ROUTES = {
    "me": ("GET", "/api/auth/me", None, ALL, 200),
    "list_events": ("GET", "/api/events", None, ALL, 200),
    "get_event": ("GET", "/api/events/{eid}", None, ALL, 200),
    "create_event": ("POST", "/api/events", {"name": "New"}, WRITERS, 201),
    "update_event": ("PUT", "/api/events/{eid}", {"name": "Renamed"}, EDITORS, 200),
    "delete_event": ("DELETE", "/api/events/{eid}", None, OWNER_ONLY, 200),
    "mara": ("POST", "/api/mara", {}, ALL, 200),
    "simulate": ("POST", "/api/simulate", {"event": {"total_budget": 1000}}, ALL, 200),
    "compare": ("POST", "/api/vendors/compare", {"quotes": []}, ALL, 200),
    "parse_seed": ("POST", "/api/vendors/parse-seed", {"text": "$5"}, ALL, 200),
    "risks": ("POST", "/api/risks", {"event": {}}, ALL, 200),
}
MATRIX = [(role, name) for name in ROUTES for role in ROLES]


@pytest.fixture
def seeded(client, tenant_id, auth_headers):
    """An event owned by a fresh tenant, plus that tenant's id."""
    res = client.post(
        "/api/events", headers=auth_headers("owner", tenant_id), json={"name": "Original"}
    )
    assert res.status_code == 201
    return {"tenant_id": tenant_id, "event_id": res.json()["id"]}


def call(client, headers, route, event_id):
    method, path, body, _, _ = ROUTES[route]
    return client.request(method, path.format(eid=event_id), headers=headers, json=body)


@pytest.mark.parametrize("role,route", MATRIX)
def test_role_gets_exact_status(client, auth_headers, seeded, role, route):
    allowed, success = ROUTES[route][3], ROUTES[route][4]
    res = call(client, auth_headers(role, seeded["tenant_id"]), route, seeded["event_id"])
    assert res.status_code == (success if role in allowed else 403), res.text


DENIED_WRITES = [
    (role, route)
    for route in ("create_event", "update_event", "delete_event")
    for role in ROLES
    if role not in ROUTES[route][3]
]


@pytest.mark.parametrize("role,route", DENIED_WRITES)
def test_denied_roles_get_forbidden_body_and_no_side_effect(
    client, auth_headers, seeded, role, route
):
    res = call(client, auth_headers(role, seeded["tenant_id"]), route, seeded["event_id"])
    assert res.json() == {"detail": FORBIDDEN}
    owner = auth_headers("owner", seeded["tenant_id"])
    events = client.get("/api/events", headers=owner).json()
    assert [(e["id"], e["name"]) for e in events] == [(seeded["event_id"], "Original")]


@pytest.mark.parametrize("role", sorted(EDITORS))
def test_allowed_update_persists(client, auth_headers, seeded, role):
    headers = auth_headers(role, seeded["tenant_id"])
    assert call(client, headers, "update_event", seeded["event_id"]).json()["name"] == "Renamed"
    stored = client.get(f"/api/events/{seeded['event_id']}", headers=headers).json()
    assert stored["name"] == "Renamed"


def test_owner_delete_removes_event(client, auth_headers, seeded):
    headers = auth_headers("owner", seeded["tenant_id"])
    res = call(client, headers, "delete_event", seeded["event_id"])
    assert res.json() == {"success": True, "deleted_id": seeded["event_id"]}
    assert client.get(f"/api/events/{seeded['event_id']}", headers=headers).status_code == 404


@pytest.mark.parametrize("route", sorted(ROUTES))
def test_missing_token_is_401_in_production(client, production_mode, route):
    res = call(client, {}, route, "any-id")
    assert res.status_code == 401
    assert res.json() == {"detail": "Authentication required."}
    assert res.headers["www-authenticate"] == "Bearer"


@pytest.mark.parametrize("path", ["/api/health", "/health"])
def test_health_probes_stay_public_in_production(client, production_mode, path):
    assert client.get(path).status_code == 200


def test_missing_token_in_dev_is_the_owner_guest_of_the_default_tenant(client):
    res = client.get("/api/auth/me")
    body = res.json()
    assert (res.status_code, body["role"], body["tenant_id"]) == (200, "owner", "tenant-default")
    assert body["user_id"] == "user-demo-guest"
