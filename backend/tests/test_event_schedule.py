"""Tests for live-calendar event schedule syncing (domain + API)."""

import uuid
from datetime import date, timedelta

from backend.app.auth.security import create_access_token
from fastapi.testclient import TestClient

from app.domain.event_schedule import sync_event_schedule
from app.main import app

TODAY = date(2026, 10, 28)


def _event():
    return {
        "date": "2025-09-14",
        "schedule_anchor": "2025-06-04",
        "tasks": [
            {"due_date": "2025-06-02", "status": "done", "completed_at": "2025-06-02"},
            {"due_date": "2025-06-12", "status": "todo"},
            {"due_date": "bad"},
        ],
        "ideas": [{"date_added": "2025-05-30"}, {"date_added": "Just now"}],
    }


def _days(a: str, b: str) -> int:
    return (date.fromisoformat(b) - date.fromisoformat(a)).days


def test_shifts_whole_timeline_by_whole_weeks():
    ev = _event()
    assert sync_event_schedule(ev, TODAY) is True
    shift = _days("2025-09-14", ev["date"])
    assert shift % 7 == 0
    assert _days("2025-06-02", ev["tasks"][0]["due_date"]) == shift
    assert ev["tasks"][0]["completed_at"] == ev["tasks"][0]["due_date"]
    assert _days("2025-05-30", ev["ideas"][0]["date_added"]) == shift
    assert ev["ideas"][1]["date_added"] == "Just now"
    assert ev["tasks"][2]["due_date"] == "bad"
    assert 0 <= (TODAY - date.fromisoformat(ev["schedule_anchor"])).days < 7
    assert date.fromisoformat(ev["date"]).weekday() == date(2025, 9, 14).weekday()


def test_idempotent_and_advances_weekly():
    ev = _event()
    sync_event_schedule(ev, TODAY)
    assert sync_event_schedule(ev, TODAY) is False
    assert sync_event_schedule(ev, TODAY + timedelta(days=6)) is False
    before = ev["date"]
    assert sync_event_schedule(ev, TODAY + timedelta(days=14)) is True
    assert _days(before, ev["date"]) > 0


def test_events_without_anchor_are_never_touched():
    ev = {"date": "2020-01-01", "tasks": [{"due_date": "2020-01-01"}]}
    assert sync_event_schedule(ev, TODAY) is False
    assert ev["date"] == "2020-01-01"


def test_api_returns_live_schedule_and_persists_it():
    client = TestClient(app)
    token = create_access_token("u-sched", f"tenant-sched-{uuid.uuid4().hex[:6]}", role="owner")
    headers = {"Authorization": f"Bearer {token}"}
    event_id = f"event-sched-{uuid.uuid4().hex[:8]}"
    body = _event()
    res = client.post(
        "/api/events",
        headers=headers,
        json={"id": event_id, "name": "Anchored", "date": body["date"], "state_json": body},
    )
    assert res.status_code == 201
    created = res.json()
    assert date.fromisoformat(created["date"]) > date.today()
    assert created["state_json"]["schedule_anchor"] != "2025-06-04"

    fetched = client.get(f"/api/events/{event_id}", headers=headers).json()
    assert fetched["date"] == created["date"]
    assert fetched["state_json"]["tasks"] == created["state_json"]["tasks"]


def test_api_stale_state_put_does_not_double_shift_date():
    client = TestClient(app)
    token = create_access_token("u-stale", f"tenant-stale-{uuid.uuid4().hex[:6]}", role="owner")
    headers = {"Authorization": f"Bearer {token}"}
    event_id = f"event-stale-{uuid.uuid4().hex[:8]}"
    body = _event()
    created = client.post(
        "/api/events",
        headers=headers,
        json={"id": event_id, "name": "Stale", "date": body["date"], "state_json": body},
    ).json()

    updated = client.put(
        f"/api/events/{event_id}", headers=headers, json={"state_json": _event()}
    ).json()
    assert updated["date"] == created["date"]
    assert updated["state_json"]["date"] == created["date"]


def test_api_anchored_event_without_state_date_stays_consistent():
    client = TestClient(app)
    token = create_access_token("u-col", f"tenant-col-{uuid.uuid4().hex[:6]}", role="owner")
    headers = {"Authorization": f"Bearer {token}"}
    event_id = f"event-col-{uuid.uuid4().hex[:8]}"
    state = {k: v for k, v in _event().items() if k != "date"}
    created = client.post(
        "/api/events",
        headers=headers,
        json={"id": event_id, "name": "Col", "date": "2025-09-14", "state_json": state},
    ).json()
    assert created["date"] == created["state_json"]["date"]
    assert date.fromisoformat(created["date"]) > date.today()
