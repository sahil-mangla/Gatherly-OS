"""Python side of the parity suite: date parsing and the anchored event schedule."""

from datetime import date

import pytest

from app.domain.event_schedule import sync_event_schedule
from app.domain.timeline_dates import parse_date

from .parity_domain_support import assert_parity, load_cases, outcome


def _sync(value):
    event = value["event"]
    changed = sync_event_schedule(event, date.fromisoformat(value["today"]))
    return {"changed": changed, "event": event}


def _parsed(value):
    parsed = parse_date(value) if isinstance(value, str) else None
    return parsed.isoformat() if parsed else None


@pytest.mark.parametrize("case", load_cases("dates"))
def test_parse_date_matches_fixture(case):
    assert_parity(outcome(_parsed, case["input"]), case["expected"])


@pytest.mark.parametrize("case", load_cases("schedule"))
def test_event_schedule_sync_matches_fixture(case):
    assert_parity(outcome(_sync, case["input"]), case["expected"])
