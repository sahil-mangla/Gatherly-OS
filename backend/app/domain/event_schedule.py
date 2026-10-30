"""Keeps an event's authored schedule in step with the real calendar.

Mirrors frontend/src/js/domain/event-dates.js. ``schedule_anchor`` is the date that "today"
corresponds to within the event's timeline. Once real time moves a full week past the anchor,
every date shifts forward by whole weeks (weekdays are preserved) and the anchor advances.
Events without an anchor are real, fixed-date events and are never touched.
"""

from datetime import date, timedelta
from typing import Any

from .timeline_dates import parse_date

DAYS_PER_WEEK = 7


def _shift_iso(value: Any, days: int) -> Any:
    parsed = parse_date(value) if isinstance(value, str) else None
    return (parsed + timedelta(days=days)).isoformat() if parsed else value


def _shift_if_set(record: dict[str, Any], key: str, days: int) -> None:
    """Shift ``record[key]`` when it holds a truthy value."""
    if record.get(key):
        record[key] = _shift_iso(record[key], days)


def _shift_task(task: dict[str, Any], days: int) -> None:
    task["due_date"] = _shift_iso(task.get("due_date"), days)
    _shift_if_set(task, "completed_at", days)


def _shift_event_dates(event: dict[str, Any], days: int) -> None:
    if "date" in event:
        event["date"] = _shift_iso(event["date"], days)
    for task in event.get("tasks") or []:
        if isinstance(task, dict):
            _shift_task(task, days)
    for idea in event.get("ideas") or []:
        if isinstance(idea, dict):
            _shift_if_set(idea, "date_added", days)


def sync_event_schedule(event: dict[str, Any], today: date | None = None) -> bool:
    """Shift an anchored event forward by whole weeks. Mutates ``event``; True if changed."""
    if not isinstance(event, dict):
        return False
    anchor = parse_date(event.get("schedule_anchor") or "")
    if anchor is None:
        return False

    today = today or date.today()
    days = max(0, (today - anchor).days // DAYS_PER_WEEK) * DAYS_PER_WEEK
    if days == 0:
        return False
    _shift_event_dates(event, days)
    event["schedule_anchor"] = (anchor + timedelta(days=days)).isoformat()
    return True
