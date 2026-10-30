"""PUT /api/events/{id} persists each scalar field, and stored state feeds /api/risks."""

import pytest

SCALARS = [
    ("venue_capacity", 321),
    ("total_budget", 98765.5),
    ("theme", "Midnight garden"),
    ("expected_guests", 77),
]


@pytest.fixture
def stored(client, auth_headers, make_event):
    headers = auth_headers("planner")
    event = make_event(
        headers,
        name="Persist",
        venue_capacity=100,
        total_budget=1000.0,
        theme="Old",
        expected_guests=10,
    )
    return headers, event


@pytest.mark.parametrize("field,value", SCALARS)
def test_each_field_is_persisted_and_the_others_untouched(client, stored, field, value):
    headers, event = stored
    res = client.put(f"/api/events/{event['id']}", headers=headers, json={field: value})
    assert res.status_code == 200 and res.json()[field] == value
    reread = client.get(f"/api/events/{event['id']}", headers=headers).json()
    expected = {**{k: event[k] for k, _ in SCALARS}, field: value}
    assert {k: reread[k] for k, _ in SCALARS} == expected
    assert reread["name"] == "Persist"


def test_all_four_fields_in_one_update_persist_together(client, stored):
    headers, event = stored
    body = dict(SCALARS)
    assert client.put(f"/api/events/{event['id']}", headers=headers, json=body).status_code == 200
    reread = client.get(f"/api/events/{event['id']}", headers=headers).json()
    assert {k: reread[k] for k in body} == body


def risks_for(client, headers, stored_event):
    event = {
        "expected_guests": stored_event["expected_guests"],
        "venue_capacity": stored_event["venue_capacity"],
        "total_budget": stored_event["total_budget"],
        **stored_event["state_json"],
    }
    return client.post("/api/risks", headers=headers, json={"event": event}).json()


def test_risks_reflect_the_updated_stored_capacity(client, stored):
    headers, event = stored
    before = client.put(
        f"/api/events/{event['id']}",
        headers=headers,
        json={"expected_guests": 150, "venue_capacity": 100},
    ).json()
    breached = risks_for(client, headers, before)
    after = client.put(
        f"/api/events/{event['id']}", headers=headers, json={"venue_capacity": 500}
    ).json()
    cleared = risks_for(client, headers, after)
    assert after["venue_capacity"] == 500
    assert breached != cleared
    assert "capacity" in str(breached).lower()
    assert "capacity" not in str(cleared).lower()
