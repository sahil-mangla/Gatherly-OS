"""EventRepository: tenant isolation, paging bounds, conflict handling and audit trail."""

import pytest

from app.db.models import AuditLog
from app.db.repository import (
    DEFAULT_PAGE_SIZE,
    MAX_PAGE_SIZE,
    EventIdConflictError,
    EventRepository,
)

from .db_fixtures import seed_events

T1, T2 = "tenant-repo-1", "tenant-repo-2"


@pytest.fixture
def repo(db_session):
    return EventRepository(db_session, T1)


@pytest.fixture
def audits(db_session):
    def rows(action=None):
        query = db_session.query(AuditLog)
        return query.filter_by(action=action).all() if action else query.all()

    return rows


def test_missing_ids_are_reported_without_side_effects(repo, audits):
    assert repo.get_event("nope") is None
    assert repo.update_event("nope", {"name": "x"}, user_id="u") is None
    assert repo.delete_event("nope", user_id="u") is False
    assert audits() == []


def test_create_generates_an_id_and_applies_defaults(repo):
    event = repo.create_event({"name": "Gala"})
    assert event.id.startswith("event-") and len(event.id) == 22
    assert (event.tenant_id, event.type, event.total_budget, event.state_json) == (
        T1,
        "wedding",
        0.0,
        {},
    )


def test_tenants_cannot_see_or_touch_each_others_events(db_session, repo, audits):
    event = repo.create_event({"name": "Mine"}, user_id="u1")
    other = EventRepository(db_session, T2)
    assert other.get_event(event.id) is None
    assert other.update_event(event.id, {"name": "Stolen"}) is None
    assert other.delete_event(event.id) is False
    assert other.list_events() == []
    assert repo.get_event(event.id).name == "Mine"
    assert [a.tenant_id for a in audits()] == [T1]


@pytest.mark.parametrize("same_tenant", [True, False])
def test_duplicate_ids_conflict_and_leave_the_session_usable(db_session, repo, audits, same_tenant):
    repo.create_event({"id": "dup-1", "name": "First"})
    taker = repo if same_tenant else EventRepository(db_session, T2)
    with pytest.raises(EventIdConflictError):
        taker.create_event({"id": "dup-1", "name": "Second"})
    assert repo.get_event("dup-1").name == "First"
    assert len(audits("create")) == 1  # the failed attempt rolled its audit row back
    assert taker.create_event({"name": "After"}).name == "After"


@pytest.mark.parametrize(
    "limit,offset,expected_len",
    [
        (None, None, DEFAULT_PAGE_SIZE),
        (0, 0, 1),
        (-5, 0, 1),
        (1, 0, 1),
        (50, 0, 50),
        (50, 100, 5),
        (50, 200, 0),
        (100, -10, 100),
        (10_000, 0, 105),
    ],
)
def test_list_events_paging_bounds(db_session, repo, limit, offset, expected_len):
    seed_events(db_session, T1, 105)
    kwargs = {k: v for k, v in (("limit", limit), ("offset", offset)) if v is not None}
    assert len(repo.list_events(**kwargs)) == expected_len


def test_list_events_caps_page_size_at_500(db_session, repo):
    seed_events(db_session, T1, MAX_PAGE_SIZE + 5)
    assert len(repo.list_events(limit=MAX_PAGE_SIZE + 1000)) == MAX_PAGE_SIZE


def test_list_events_is_newest_first_and_pages_do_not_overlap(db_session, repo):
    seed_events(db_session, T1, 12)
    pages = [repo.list_events(limit=5, offset=o) for o in (0, 5, 10)]
    ids = [e.id for page in pages for e in page]
    assert ids == [f"{T1}-e{i:04d}" for i in range(11, -1, -1)]


def test_negative_offset_is_clamped_to_zero(db_session, repo):
    seed_events(db_session, T1, 3)
    assert [e.id for e in repo.list_events(limit=2, offset=-7)] == [f"{T1}-e0002", f"{T1}-e0001"]


def test_audit_rows_record_create_update_and_delete(repo, audits):
    event = repo.create_event({"name": "Audited", "total_budget": 500}, user_id="u-audit")
    repo.update_event(event.id, {"name": "Renamed", "expected_guests": 9}, user_id="u-audit")
    repo.delete_event(event.id, user_id="u-audit")
    rows = {a.action: a for a in audits()}
    assert set(rows) == {"create", "update", "delete"}
    assert all(
        (a.tenant_id, a.user_id, a.resource_type, a.resource_id)
        == (T1, "u-audit", "event", event.id)
        for a in rows.values()
    )
    assert rows["create"].details_json == {"name": "Audited", "budget": 500.0}
    assert rows["update"].details_json == {"updated_fields": ["name", "expected_guests"]}
    assert rows["delete"].details_json == {"name": "Renamed"}
    assert repo.get_event(event.id) is None


def test_update_ignores_unknown_fields_and_keeps_untouched_ones(repo):
    event = repo.create_event({"name": "Keep", "total_budget": 10.0, "theme": "boho"})
    updated = repo.update_event(event.id, {"expected_guests": 40, "id": "hijack", "tenant_id": "x"})
    assert (updated.id, updated.tenant_id) == (event.id, T1)
    assert (updated.name, updated.total_budget, updated.theme, updated.expected_guests) == (
        "Keep",
        10.0,
        "boho",
        40,
    )


def test_date_update_is_mirrored_into_state_only_when_state_has_a_date(repo):
    with_date = repo.create_event({"name": "A", "state_json": {"date": "2026-01-01", "k": 1}})
    without = repo.create_event({"name": "B", "state_json": {"k": 1}})
    assert repo.update_event(with_date.id, {"date": "2027-02-02"}).state_json == {
        "date": "2027-02-02",
        "k": 1,
    }
    assert repo.update_event(without.id, {"date": "2027-02-02"}).state_json == {"k": 1}


def test_explicit_state_json_replaces_the_document(repo):
    event = repo.create_event({"name": "S", "state_json": {"old": True}})
    assert repo.update_event(event.id, {"state_json": {"new": 1}}).state_json == {"new": 1}
