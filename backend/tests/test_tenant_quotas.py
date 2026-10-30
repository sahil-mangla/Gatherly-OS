"""Per-tenant quotas, server-side event ids and the state_json size cap."""

import re

import pytest

from app.db.models import AuditLog, EventModel
from app.db.repository import EventLimitError, EventRepository

LIMIT_BODY = {"detail": "Event limit reached for this organization."}
SERVER_ID = re.compile(r"^event-[0-9a-f]{32}$")
# json.dumps({"b": ""}) is 9 characters, so this blob serialises to exactly the requested size.
EMPTY_DOC = len('{"b": ""}')


def state_of_size(size):
    return {"b": "a" * (size - EMPTY_DOC)}


@pytest.fixture
def two_event_limit(settings, monkeypatch):
    monkeypatch.setattr(settings, "max_events_per_tenant", 2)
    return 2


def test_defaults_match_the_documented_quotas(settings):
    assert (settings.max_events_per_tenant, settings.max_state_json_bytes) == (100, 128 * 1024)
    assert settings.mara_global_per_minute == 120


def test_creating_beyond_the_event_limit_is_a_409(isolated_client, auth_headers, two_event_limit):
    headers = auth_headers("owner", "tenant-quota-a")
    for name in ("one", "two"):
        assert (
            isolated_client.post("/api/events", headers=headers, json={"name": name}).status_code
            == 201
        )
    res = isolated_client.post("/api/events", headers=headers, json={"name": "three"})
    assert (res.status_code, res.json()) == (409, LIMIT_BODY)
    names = [e["name"] for e in isolated_client.get("/api/events", headers=headers).json()]
    assert sorted(names) == ["one", "two"]


def test_the_limit_is_per_tenant_and_frees_up_on_delete(
    isolated_client, db_session, auth_headers, two_event_limit
):
    a, b = auth_headers("owner", "tenant-quota-a"), auth_headers("owner", "tenant-quota-b")
    ids = [
        isolated_client.post("/api/events", headers=a, json={"name": "x"}).json()["id"]
        for _ in range(2)
    ]
    assert isolated_client.post("/api/events", headers=a, json={"name": "x"}).status_code == 409
    assert isolated_client.post("/api/events", headers=b, json={"name": "other"}).status_code == 201
    assert isolated_client.delete(f"/api/events/{ids[0]}", headers=a).status_code == 200
    assert isolated_client.post("/api/events", headers=a, json={"name": "again"}).status_code == 201
    assert db_session.query(EventModel).filter_by(tenant_id="tenant-quota-a").count() == 2


def test_a_rejected_create_writes_nothing(db_session, settings, monkeypatch):
    monkeypatch.setattr(settings, "max_events_per_tenant", 1)
    repo = EventRepository(db_session, "tenant-quota-repo")
    repo.create_event({"name": "only"}, user_id="u")
    with pytest.raises(EventLimitError):
        repo.create_event({"name": "extra"}, user_id="u")
    assert repo.count_events() == 1
    assert db_session.query(AuditLog).filter_by(action="create").count() == 1


def test_default_limit_is_100_events_per_tenant(isolated_client, db_session, auth_headers):
    from .db_fixtures import seed_events

    seed_events(db_session, "tenant-quota-full", 100)
    headers = auth_headers("owner", "tenant-quota-full")
    res = isolated_client.post("/api/events", headers=headers, json={"name": "101st"})
    assert (res.status_code, res.json()) == (409, LIMIT_BODY)


def test_client_supplied_ids_are_ignored(client, auth_headers):
    headers = auth_headers("owner")
    first = client.post("/api/events", headers=headers, json={"id": "chosen-id", "name": "A"})
    second = client.post("/api/events", headers=headers, json={"id": "chosen-id", "name": "B"})
    assert (first.status_code, second.status_code) == (201, 201)
    ids = {first.json()["id"], second.json()["id"]}
    assert len(ids) == 2 and all(SERVER_ID.match(i) for i in ids)
    assert client.get("/api/events/chosen-id", headers=headers).status_code == 404


def test_probing_ids_reveals_nothing_across_tenants(client, auth_headers, make_event):
    victim = make_event(auth_headers("owner"), name="Victim")
    attacker = auth_headers("owner")
    res = client.post("/api/events", headers=attacker, json={"id": victim["id"], "name": "Probe"})
    assert res.status_code == 201 and res.json()["id"] != victim["id"]
    assert client.get(f"/api/events/{victim['id']}", headers=attacker).status_code == 404


def test_state_json_accepts_up_to_128_kb_and_rejects_more(client, auth_headers):
    headers = auth_headers("owner")
    exact = state_of_size(128 * 1024)
    ok = client.post("/api/events", headers=headers, json={"name": "Big", "state_json": exact})
    assert ok.status_code == 201 and ok.json()["state_json"] == exact
    over = client.post(
        "/api/events",
        headers=headers,
        json={"name": "Bigger", "state_json": state_of_size(128 * 1024 + 1)},
    )
    assert over.status_code == 422
    assert over.json()["detail"][0]["loc"] == ["body", "state_json"]
    assert "exceeds 128 KB limit" in over.json()["detail"][0]["msg"]


def test_state_json_cap_applies_to_updates_and_follows_the_setting(
    client, auth_headers, make_event, settings, monkeypatch
):
    headers = auth_headers("owner")
    event = make_event(headers, name="Cap")
    monkeypatch.setattr(settings, "max_state_json_bytes", 2048)
    res = client.put(
        f"/api/events/{event['id']}", headers=headers, json={"state_json": state_of_size(3000)}
    )
    assert res.status_code == 422 and "exceeds 2 KB limit" in res.json()["detail"][0]["msg"]
    fine = client.put(
        f"/api/events/{event['id']}", headers=headers, json={"state_json": state_of_size(2048)}
    )
    assert fine.status_code == 200


def test_list_default_is_50_with_max_500(isolated_client, db_session, auth_headers):
    from .db_fixtures import seed_events

    seed_events(db_session, "tenant-quota-list", 60)
    headers = auth_headers("vendor", "tenant-quota-list")
    assert len(isolated_client.get("/api/events", headers=headers).json()) == 50
    assert len(isolated_client.get("/api/events?limit=500", headers=headers).json()) == 60
    assert isolated_client.get("/api/events?limit=501", headers=headers).status_code == 422
