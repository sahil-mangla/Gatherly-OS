"""Remaining branches of the shared event-schedule domain."""

from datetime import date

from app.domain.event_schedule import sync_event_schedule


def test_non_dict_and_missing_anchor_are_untouched():
    assert sync_event_schedule("x") is False  # type: ignore[arg-type]
    assert sync_event_schedule({"date": "2025-01-01"}, date(2026, 1, 1)) is False
    assert sync_event_schedule({"schedule_anchor": "bad"}, date(2026, 1, 1)) is False


def test_anchor_in_the_future_never_shifts_backwards():
    event = {"schedule_anchor": "2030-01-01", "date": "2030-02-01"}
    assert sync_event_schedule(event, date(2026, 1, 1)) is False
    assert event["date"] == "2030-02-01"


def test_none_tasks_and_ideas_and_missing_date_are_tolerated():
    event = {"schedule_anchor": "2025-01-01", "tasks": None, "ideas": None}
    assert sync_event_schedule(event, date(2025, 1, 15)) is True
    assert event["schedule_anchor"] == "2025-01-15"
    assert "date" not in event


def test_non_string_dates_are_left_alone():
    event = {"schedule_anchor": "2025-01-01", "date": 5, "tasks": [{"due_date": None}, "x"]}
    assert sync_event_schedule(event, date(2025, 1, 8)) is True
    assert event["date"] == 5
    assert event["tasks"][0]["due_date"] is None
