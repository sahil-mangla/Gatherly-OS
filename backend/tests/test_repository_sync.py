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
