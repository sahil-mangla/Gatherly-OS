"""Request validation through the real routes: 422 bodies must name the offending field."""

import uuid

import pytest

BIG = "a" * (129 * 1024)  # exceeds the 128 KB state cap while staying under the 1 MB body cap
BIG_CONTEXT = {"blob": "a" * (257 * 1024)}
EVENT_OK = {"name": "Valid"}
REGISTER_OK = {
    "organization_name": "Valid Org",
    "full_name": "Valid Person",
    "email": "valid@example.com",
    "password": "password-123",
}

EVENT_CASES = {
    "negative_budget": ({"total_budget": -1}, "total_budget"),
    "budget_above_cap": ({"total_budget": 1e13}, "total_budget"),
    "negative_guests": ({"expected_guests": -1}, "expected_guests"),
    "guests_above_cap": ({"expected_guests": 10_000_001}, "expected_guests"),
    "negative_capacity": ({"venue_capacity": -1}, "venue_capacity"),
    "empty_name": ({"name": ""}, "name"),
    "long_name": ({"name": "n" * 201}, "name"),
    "long_type": ({"type": "t" * 65}, "type"),
    "long_date": ({"date": "d" * 33}, "date"),
    "long_theme": ({"theme": "t" * 513}, "theme"),
    "bad_id_chars": ({"id": "bad id!"}, "id"),
    "long_id": ({"id": "x" * 65}, "id"),
    "oversized_state": ({"state_json": {"blob": BIG}}, "state_json"),
    "budget_wrong_type": ({"total_budget": "lots"}, "total_budget"),
    "guests_fraction": ({"expected_guests": 1.5}, "expected_guests"),
    "name_wrong_type": ({"name": 123}, "name"),
    "state_wrong_type": ({"state_json": [1]}, "state_json"),
}
AUTH_CASES = {
    "register_bad_email": ("/api/auth/register", {**REGISTER_OK, "email": "nope"}, "email"),
    "register_long_email": (
        "/api/auth/register",
        {**REGISTER_OK, "email": "a" * 250 + "@x.io"},
        "email",
    ),
    "register_short_password": (
        "/api/auth/register",
        {**REGISTER_OK, "password": "x" * 7},
        "password",
    ),
    "register_long_password": (
        "/api/auth/register",
        {**REGISTER_OK, "password": "x" * 129},
        "password",
    ),
    "register_short_org": (
        "/api/auth/register",
        {**REGISTER_OK, "organization_name": "x"},
        "organization_name",
    ),
    "register_long_name": (
        "/api/auth/register",
        {**REGISTER_OK, "full_name": "x" * 121},
        "full_name",
    ),
    "register_missing_field": ("/api/auth/register", {"email": "a@b.io"}, "password"),
    "login_bad_email": ("/api/auth/login", {"email": "nope", "password": "x"}, "email"),
    "login_empty_password": ("/api/auth/login", {"email": "a@b.io", "password": ""}, "password"),
    "login_long_password": (
        "/api/auth/login",
        {"email": "a@b.io", "password": "x" * 129},
        "password",
    ),
}
COMPUTE_CASES = {
    "mara_long_prompt": ("/api/mara", {"prompt": "p" * 4001}, "prompt"),
    "mara_long_operation": ("/api/mara", {"operation": "o" * 65}, "operation"),
    "mara_big_context": ("/api/mara", {"context": BIG_CONTEXT}, "context"),
    "mara_prompt_type": ("/api/mara", {"prompt": ["x"]}, "prompt"),
    "simulate_missing_event": ("/api/simulate", {}, "event"),
    "simulate_event_type": ("/api/simulate", {"event": "x"}, "event"),
    "simulate_big_event": ("/api/simulate", {"event": BIG_CONTEXT}, "event"),
    "simulate_guest_delta": ("/api/simulate", {"event": {}, "guest_delta": 100_001}, "guest_delta"),
    "simulate_variance": (
        "/api/simulate",
        {"event": {}, "catering_variance_pct": 1001},
        "catering_variance_pct",
    ),
    "compare_too_many": ("/api/vendors/compare", {"quotes": [{}] * 101}, "quotes"),
    "compare_wrong_item": ("/api/vendors/compare", {"quotes": ["x"]}, "quotes"),
    "seed_too_long": ("/api/vendors/parse-seed", {"text": "t" * 20_001}, "text"),
    "risks_long_ref_date": ("/api/risks", {"event": {}, "ref_date": "d" * 33}, "ref_date"),
}


def error_locs(res):
    assert res.status_code == 422, res.text
    return [e["loc"] for e in res.json()["detail"]]


@pytest.mark.parametrize("fields,field", EVENT_CASES.values(), ids=EVENT_CASES.keys())
def test_event_create_rejects_invalid_fields(client, auth_headers, fields, field):
    res = client.post("/api/events", headers=auth_headers(), json={**EVENT_OK, **fields})
    assert ["body", field] in error_locs(res)


UPDATE_CASES = {k: v for k, v in EVENT_CASES.items() if "id" not in v[0]}


@pytest.mark.parametrize("fields,field", UPDATE_CASES.values(), ids=UPDATE_CASES.keys())
def test_event_update_rejects_invalid_fields(client, auth_headers, make_event, fields, field):
    owner = auth_headers()
    event = make_event(owner)
    res = client.put(f"/api/events/{event['id']}", headers=owner, json=fields)
    assert ["body", field] in error_locs(res)
    assert client.get(f"/api/events/{event['id']}", headers=owner).json()["name"] == "Fixture Event"


@pytest.mark.parametrize("path,body,field", AUTH_CASES.values(), ids=AUTH_CASES.keys())
def test_auth_payloads_are_validated(client, path, body, field):
    assert ["body", field] in error_locs(client.post(path, json=body))


@pytest.mark.parametrize("path,body,field", COMPUTE_CASES.values(), ids=COMPUTE_CASES.keys())
def test_compute_payloads_are_validated(client, auth_headers, path, body, field):
    res = client.post(path, headers=auth_headers(), json=body)
    assert any(loc[:2] == ["body", field] for loc in error_locs(res))


def test_oversized_json_document_message_states_the_limit(client, auth_headers):
    res = client.post("/api/mara", headers=auth_headers(), json={"context": BIG_CONTEXT})
    assert "exceeds 256 KB limit" in res.json()["detail"][0]["msg"]


def test_malformed_json_is_a_422_not_a_crash(client, auth_headers):
    headers = {**auth_headers(), "content-type": "application/json"}
    res = client.post("/api/events", headers=headers, content=b'{"name": ')
    assert res.status_code == 422


@pytest.mark.parametrize(
    "path,body",
    [
        ("/api/vendors/compare", {"quotes": [{}] * 100}),
        ("/api/mara", {"prompt": "p" * 4000, "operation": "o" * 64}),
        ("/api/vendors/parse-seed", {"text": "t" * 20_000}),
    ],
)
def test_values_at_the_limits_are_accepted(client, auth_headers, path, body):
    assert client.post(path, headers=auth_headers(), json=body).status_code == 200


def test_register_accepts_the_longest_password(client):
    email = f"longpw-{uuid.uuid4().hex[:8]}@example.com"
    body = {**REGISTER_OK, "email": email, "password": "x" * 128}
    assert client.post("/api/auth/register", json=body).status_code == 200


def test_event_at_max_lengths_is_accepted(client, auth_headers):
    payload = {
        "id": "i" * 64,
        "name": "n" * 200,
        "type": "t" * 64,
        "date": "d" * 32,
        "theme": "h" * 512,
        "total_budget": 1e12,
        "expected_guests": 10_000_000,
        "venue_capacity": 10_000_000,
    }
    res = client.post("/api/events", headers=auth_headers(), json=payload)
    assert res.status_code == 201
    assert res.json()["name"] == "n" * 200 and res.json()["total_budget"] == 1e12
    assert res.json()["id"] != "i" * 64  # the client id is accepted but never used


def test_event_defaults_are_applied(client, auth_headers):
    body = client.post("/api/events", headers=auth_headers(), json={"name": "Defaults"}).json()
    assert (body["type"], body["total_budget"], body["expected_guests"]) == ("wedding", 0.0, 0)
    assert (body["theme"], body["state_json"], body["date"]) == ("", {}, None)
    assert body["id"].startswith("event-") and len(body["id"]) == 38


def test_event_list_query_bounds(client, auth_headers):
    headers = auth_headers()
    for query, name in (("limit=0", "limit"), ("limit=501", "limit"), ("offset=-1", "offset")):
        res = client.get(f"/api/events?{query}", headers=headers)
        assert ["query", name] in error_locs(res)
    assert client.get("/api/events?limit=500&offset=0", headers=headers).status_code == 200
