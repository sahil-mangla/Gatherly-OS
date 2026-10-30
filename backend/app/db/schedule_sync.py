"""Schedule syncing for anchored events, mixed into ``EventRepository``.

Reads stay free of side effects unless the calendar has actually moved a full week past an
event's ``schedule_anchor``: no state copy and no write happen for unanchored or current events.
"""

import copy
from datetime import date
from typing import Any

from ..domain.event_schedule import sync_event_schedule
from .models import EventModel


def shift_is_due(state: Any, today: date | None = None) -> bool:
    """Cheap check (no copy of ``state``): is it anchored and at least a week behind ``today``?"""
    if not isinstance(state, dict):
        return False
    return sync_event_schedule({"schedule_anchor": state.get("schedule_anchor")}, today)


class ScheduleSyncMixin:
    """Provides ``sync_schedule(s)``; requires ``self.db`` and ``self.log_audit``."""

    def sync_schedules(
        self, events: list[EventModel], today: date | None = None, user_id: str | None = None
    ) -> list[EventModel]:
        """Sync a batch of events and persist every change with a single commit."""
        synced = [self.sync_schedule(e, today, user_id, commit=False) for e in events]
        if self.db.new:  # audit rows are only queued when a schedule actually moved
            self.db.commit()
        return synced

    def sync_schedule(
        self,
        event: EventModel,
        today: date | None = None,
        user_id: str | None = None,
        commit: bool = True,
    ) -> EventModel:
        """Advance an anchored event's schedule to the current week and persist the change."""
        if not shift_is_due(event.state_json, today):
            return event
        view = copy.deepcopy(event.state_json)
        # The anchor lives in state_json, so the state's own date must move with it. Seed it from
        # the column when absent, then mirror the result back; shifting the column independently
        # would double-shift whenever a client resends a stale state over an already-live column.
        if "date" not in view:
            view["date"] = event.date
        sync_event_schedule(view, today)

        event.date = view["date"]
        event.state_json = view
        self.log_audit(
            user_id=user_id,
            action="schedule_sync",
            resource_type="event",
            resource_id=event.id,
            details={"date": event.date, "schedule_anchor": view.get("schedule_anchor")},
        )
        if commit:
            self.db.commit()
        return event
