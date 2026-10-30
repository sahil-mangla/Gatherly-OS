"""Edge-case and guard-branch tests for the budget engine."""

import pytest

from app.domain.budget import (
    calculate_budget_summary,
    format_money,
    safe_non_negative_number,
    validate_expense_input,
)


@pytest.mark.parametrize(
    "value,expected",
    [
        (None, 0.0),
        (-3, 0.0),
        ("7.5", 7.5),
        ("abc", 0.0),
        ([], 0.0),
        (12, 12.0),
        ("nan", 0.0),
        ("inf", 0.0),
        (float("inf"), 0.0),
        (float("nan"), 0.0),
        ("1_000", 0.0),
        (" 12 ", 12.0),
        ("1e3", 1000.0),
        (True, 1.0),
    ],
)
def test_safe_non_negative_number(value, expected):
    assert safe_non_negative_number(value) == expected


def test_format_money():
    assert format_money(1234.5) == "$1,235"  # halves round up, exactly like JS Math.round
    assert format_money(0.5) == "$1"
    assert format_money(2.4999) == "$2"
    assert format_money(-5) == "$0"
    assert format_money("x", currency="EUR ") == "EUR 0"


def test_validate_expense_rejects_non_dict():
    assert validate_expense_input("nope") == (False, ["Expense payload must be an object."])


@pytest.mark.parametrize(
    "payload,fragment",
    [
        ({"description": "x", "planned_amount": "abc"}, "Planned amount must be a valid number"),
        ({"description": "x"}, "Planned amount must be a valid number"),
        ({"description": "x", "planned_amount": -1}, "positive number or zero"),
        (
            {"description": "x", "planned_amount": 1, "actual_amount": -1},
            "Actual amount cannot be negative",
        ),
        (
            {"description": "x", "planned_amount": 1, "actual_amount": "bad"},
            "Actual amount must be a valid number",
        ),
        (
            {"description": "x", "planned_amount": 1, "committed_amount": -2},
            "Committed amount cannot be negative",
        ),
        (
            {"description": "x", "planned_amount": 1, "committed_amount": None},
            "Committed amount must be a valid number",
        ),
        ({"description": 5, "planned_amount": 1}, "Description is required"),
        ({"description": "  ", "planned_amount": 1}, "Description is required"),
        ({"description": "x", "planned_amount": 1, "category": "zzz"}, "Invalid category 'zzz'"),
    ],
)
def test_validate_expense_error_branches(payload, fragment):
    valid, errors = validate_expense_input(payload)
    assert valid is False
    assert any(fragment in e for e in errors)


def test_validate_expense_accepts_zero_amounts_and_missing_category():
    valid, errors = validate_expense_input({"description": "ok", "planned_amount": 0})
    assert (valid, errors) == (True, [])


def test_summary_rejects_non_dict_event():
    with pytest.raises(ValueError):
        calculate_budget_summary([])


def test_summary_ignores_malformed_expenses_and_unknown_category():
    summary = calculate_budget_summary(
        {
            "total_budget": 1000,
            "expenses": ["junk", None, {"category": "mystery", "actual_amount": 100}],
        }
    )
    assert summary["categories"]["other"]["actual"] == 100.0
    assert summary["total_spent"] == 100.0
    assert calculate_budget_summary({"expenses": "not-a-list"})["total_allocated"] == 0.0


def test_summary_zero_budget_has_no_percentages_and_flags_overrun():
    summary = calculate_budget_summary(
        {"total_budget": 0, "expenses": [{"category": "venue", "actual_amount": 50}]}
    )
    assert summary["percent_committed"] == 0
    assert summary["is_over_budget"] is True
    assert summary["deficit_amount"] == 50.0
    assert summary["categories"]["venue"]["percent_of_budget"] == 0


def test_summary_negative_budget_clamped_to_zero():
    assert calculate_budget_summary({"total_budget": -10})["total_budget"] == 0.0


def test_percent_committed_is_capped_at_100():
    summary = calculate_budget_summary(
        {"total_budget": 100, "expenses": [{"category": "venue", "actual_amount": 900}]}
    )
    assert summary["percent_committed"] == 100
    assert summary["categories"]["venue"]["percent_of_budget"] == 900


def test_category_overrun_requires_positive_plan():
    summary = calculate_budget_summary(
        {
            "total_budget": 1000,
            "expenses": [
                {"category": "venue", "planned_amount": 0, "actual_amount": 100},
                {"category": "design", "planned_amount": 50, "actual_amount": 100},
                {"category": "catering", "planned_amount": 500, "actual_amount": 100},
            ],
        }
    )
    cats = summary["categories"]
    assert cats["venue"]["is_overrun"] is False
    assert cats["design"]["is_overrun"] is True
    assert cats["design"]["variance"] == 50.0
    assert cats["catering"]["is_overrun"] is False
    assert cats["catering"]["variance"] == -400.0
