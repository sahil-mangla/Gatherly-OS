"""Regression tests for every Python/JS disagreement the parity fixtures exposed (Python side)."""

import math

import pytest

from app.domain.budget import calculate_budget_summary, format_money, validate_expense_input
from app.domain.numeric import (
    format_amount,
    format_signed_tenths,
    number_or,
    round_half_up,
    safe_non_negative_number,
    to_int,
)
from app.domain.risks import evaluate_event_risks
from app.domain.simulation import simulate_ripple
from app.domain.timeline import validate_task
from app.domain.timeline_dates import parse_date

BASE = {
    "total_budget": 10000,
    "expected_guests": 100,
    "venue_capacity": 120,
    "expenses": [],
    "tasks": [],
}


@pytest.mark.parametrize(
    "bad",
    [
        "2023-02-29",
        "2026-02-30",
        "2026-13-01",
        "20260601",
        "2026-W23-1",
        "2026-6-1",
        "２０２６-０６-０１",
    ]
    + ["2026-06-01garbage", " 2026-06-01", "2026-06-01\n", "0000-01-01", None, 20260601, True],
)
def test_parse_date_is_strict_iso_calendar(bad):
    assert parse_date(bad) is None


@pytest.mark.parametrize("good", ["2026-06-01", "2026-06-01T10:30:00", "2026-06-01 10:30"])
def test_parse_date_accepts_optional_time_part(good):
    assert parse_date(good).isoformat() == "2026-06-01"


def test_validate_task_rejects_basic_iso_and_numeric_dates():
    for due in ("20260601", 20260601, "2026-02-30"):
        assert validate_task({"title": "x", "due_date": due})[0] is False


def test_number_or_accepts_plain_decimals_only():
    assert number_or(" 12 ", 0) == 12.0
    assert number_or("1e3", 0) == 1000.0
    assert number_or(True, 0) == 1.0
    for bad in ["nan", "inf", "1_000", "0x10", "", " ", None, [5], {}, math.nan, math.inf, "1e999"]:
        assert number_or(bad, -1) == -1, bad
    assert safe_non_negative_number("nan") == 0.0


def test_rounding_sends_halves_up():
    assert [round_half_up(v) for v in (0.5, 1.5, 2.5, -0.5, -1.5, -0.4)] == [1, 2, 3, 0, -1, 0]
    assert format_amount(1234.5) == "1,235"
    assert format_money(2.5) == "$3"
    assert format_signed_tenths(12.25) == "+12.3"
    assert format_signed_tenths(-0.04) == "-0.0"
    assert (to_int("2.9", 0), to_int(-2.7, 0), to_int("x", 7)) == (2, -2, 7)


def test_half_percent_rounds_up_like_javascript():
    event = {
        "total_budget": 1000,
        "expenses": [{"category": "venue", "actual_amount": 100, "committed_amount": 25}],
    }
    assert calculate_budget_summary(event)["categories"]["venue"]["percent_of_budget"] == 13


def test_validation_messages_use_object_wording():
    assert validate_expense_input([]) == (False, ["Expense payload must be an object."])
    assert validate_task([]) == (False, ["Task must be an object."])
    item = {"description": "x", "planned_amount": 1, "actual_amount": "", "committed_amount": "inf"}
    assert validate_expense_input(item)[1] == [
        "Actual amount must be a valid number.",
        "Committed amount must be a valid number.",
    ]


def test_simulation_narrative_formats():
    event = {**BASE, "expenses": [{"category": "catering", "planned_amount": 1234567.5}]}
    narrative = simulate_ripple(event, {"guest_delta": 3, "catering_variance_pct": 12.25})[
        "narrative"
    ]
    assert narrative[0] == "Guest count shifts by +3 (projected total: 103)."
    assert narrative[1] == "Catering package variance: +12.3%."
    assert narrative[2] == "Projected financial shift: +$151,355."


def test_simulation_garbage_inputs_fall_back_instead_of_raising():
    event = {
        **BASE,
        "expenses": [
            None,
            "x",
            {"category": "catering", "planned_amount": 200, "cost_per_guest": 10},
        ],
        "tasks": "nope",
    }
    res = simulate_ripple(event, {"guest_delta": "abc", "catering_variance_pct": None})
    assert res["projected"]["cost_delta"] == 0
    assert res["affected_tasks"] == []
    assert simulate_ripple(event, [1, 2])["projected"]["guests"] == 100
    assert (
        simulate_ripple({**BASE, "expenses": "nope"}, {"guest_delta": 1})["projected"]["guests"]
        == 101
    )


def test_fractional_deltas_truncate_and_zero_cost_per_guest_is_free():
    res = simulate_ripple(BASE, {"guest_delta": 2.7})
    assert res["projected"]["guests"] == 102
    free = {**BASE, "expenses": [{"category": "catering", "cost_per_guest": 0}]}
    assert simulate_ripple(free, {"guest_delta": 5})["projected"]["cost_delta"] == 0
    cheap = {**BASE, "expenses": [{"category": "catering", "cost_per_guest": -9}]}
    assert simulate_ripple(cheap, {"guest_delta": 5})["projected"]["cost_delta"] == 0


def test_invitation_and_guest_category_tasks_are_affected():
    tasks = [
        {"id": "a", "title": "Send invitation drafts"},
        {"id": "b", "category": "guest favours"},
    ]
    res = simulate_ripple({**BASE, "tasks": tasks})
    assert [t["id"] for t in res["affected_tasks"]] == ["a", "b"]


def test_risk_money_and_capacity_text_use_grouping_and_whole_numbers():
    event = {
        **BASE,
        "total_budget": 1234567.5,
        "expenses": [{"category": "venue", "actual_amount": 2000000.5}],
    }
    (risk,) = evaluate_event_risks(event)["risks"]
    assert risk["evidence"] == (
        "Total allocated spend ($2,000,001) exceeds total budget ($1,234,568) by $765,433."
    )
    big = {**BASE, "expected_guests": 2500000, "venue_capacity": 1234567}
    (capacity,) = evaluate_event_risks(big)["risks"]
    assert (
        "(2500000)" in capacity["evidence"]
        and "(1234567) by 1265433 guests" in capacity["evidence"]
    )
    assert evaluate_event_risks([])["total_count"] == 0
