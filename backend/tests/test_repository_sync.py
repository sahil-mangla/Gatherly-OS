"""Schedule syncing through the repository: one commit per batch and an audit row per move."""

from datetime import date

import pytest

from app.db.models import AuditLog, EventModel
from app.db.repository import EventRepository

T1 = "tenant-sync-1"


@pytest.fixture
def repo(db_session):
    return EventRepository(db_session, T1)


@pytest.fixture
def audits(db_session):
    return lambda action: db_session.query(AuditLog).filter_by(action=action).all()


def anchored(db_session, tenant, index):
    state = {"schedule_anchor": "2026-01-07", "tasks": [{"due_date": "2026-01-10"}]}
    db_session.add(
        EventModel(
            id=f"{tenant}-a{index}", tenant_id=tenant, name="A", date="2026-03-01", state_json=state
        )
    )


@pytest.fixture
def count_commits(db_session, monkeypatch):
    calls = []
    original = db_session.commit
    monkeypatch.setattr(db_session, "commit", lambda: calls.append(1) or original())
    return calls


def test_schedule_sync_of_many_events_uses_one_commit(db_session, repo, audits, count_commits):
    for i in range(3):
        anchored(db_session, T1, i)
    db_session.commit()
    count_commits.clear()
    synced = repo.sync_schedules(repo.list_events(), today=date(2026, 2, 4), user_id="u-sync")
    assert len(count_commits) == 1
    assert {e.date for e in synced} == {"2026-03-29"}
    rows = audits("schedule_sync")
    assert len(rows) == 3 and {r.user_id for r in rows} == {"u-sync"}
    assert {e.state_json["schedule_anchor"] for e in synced} == {"2026-02-04"}


def test_schedule_sync_is_a_noop_without_changes(db_session, repo, audits, count_commits):
    repo.create_event({"name": "Fixed date", "date": "2026-05-05"})
    count_commits.clear()
    repo.sync_schedules(repo.list_events(), today=date(2030, 1, 1))
    assert count_commits == [] and audits("schedule_sync") == []


def test_single_event_sync_commits_unless_deferred(db_session, repo, count_commits):
    anchored(db_session, T1, 9)
    db_session.commit()
    count_commits.clear()
    event = repo.get_event(f"{T1}-a9")
    repo.sync_schedule(event, today=date(2026, 2, 4), commit=False)
    assert count_commits == []
    repo.sync_schedule(repo.get_event(f"{T1}-a9"), today=date(2026, 3, 4))
    assert len(count_commits) == 1


@pytest.fixture
def copies(monkeypatch):
    """Count deepcopy calls made by the schedule sync (only that module's ``copy`` is patched)."""
    import copy as real_copy
    from types import SimpleNamespace

    from app.db import schedule_sync

    calls = []
    monkeypatch.setattr(
        schedule_sync,
        "copy",
        SimpleNamespace(deepcopy=lambda value: calls.append(1) or real_copy.deepcopy(value)),
    )
    return calls


def add_event(db_session, event_id, state, date_="2026-03-01"):
    db_session.add(EventModel(id=event_id, tenant_id=T1, name="E", date=date_, state_json=state))
    db_session.commit()


@pytest.mark.parametrize(
    "state",
    [
        {},
        {"tasks": [{"due_date": "2026-01-01"}]},
        {"schedule_anchor": None},
        {"schedule_anchor": "not-a-date"},
        {"schedule_anchor": 12345},
        {"schedule_anchor": "2026-02-01"},  # anchored but less than a week behind "today"
        [1, 2],  # a non-object document is left alone
    ],
)
def test_events_that_need_no_shift_cost_no_copy_and_no_write(
    db_session, repo, audits, count_commits, copies, state
):
    add_event(db_session, "e-calm", state)
    count_commits.clear()
    events = repo.sync_schedules(repo.list_events(), today=date(2026, 2, 4), user_id="u")
    single = repo.sync_schedule(repo.get_event("e-calm"), today=date(2026, 2, 4))
    assert copies == [] and count_commits == [] and audits("schedule_sync") == []
    assert events[0].state_json == state == single.state_json
    assert events[0].date == "2026-03-01" and not db_session.dirty and not db_session.new


def test_an_anchored_event_that_is_due_is_copied_exactly_once_and_written(
    db_session, repo, audits, count_commits, copies
):
    anchored(db_session, T1, 5)
    db_session.commit()
    count_commits.clear()
    repo.sync_schedules(repo.list_events(), today=date(2026, 2, 4), user_id="u")
    assert len(copies) == 1 and len(count_commits) == 1
    assert len(audits("schedule_sync")) == 1
    assert repo.get_event(f"{T1}-a5").state_json["schedule_anchor"] == "2026-02-04"


def test_the_list_and_get_endpoints_do_not_copy_unanchored_events(
    isolated_client, auth_headers, copies
):
    headers = auth_headers("owner", "tenant-sync-api")
    created = isolated_client.post("/api/events", headers=headers, json={"name": "Fixed"}).json()
    assert isolated_client.get("/api/events", headers=headers).status_code == 200
    assert isolated_client.get(f"/api/events/{created['id']}", headers=headers).status_code == 200
    assert copies == []
