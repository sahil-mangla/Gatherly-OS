"""Tests for authoritative budget calculations and financial invariance."""

import pytest

from app.domain.budget import calculate_budget_summary, validate_expense_input


@pytest.fixture
def sample_event():
    return {
        "id": "wedding-test",
        "name": "Leila & Noor",
        "total_budget": 24000.0,
        "expenses": [
            {
                "id": "1",
                "category": "venue",
                "description": "Venue deposit",
                "planned_amount": 9600.0,
                "actual_amount": 4800.0,
                "committed_amount": 4800.0,
            },
            {
                "id": "2",
                "category": "catering",
                "description": "Catering deposit",
                "planned_amount": 4780.0,
                "actual_amount": 1400.0,
                "committed_amount": 3380.0,
            },
            {
                "id": "3",
                "category": "contingency",
                "description": "Buffer",
                "planned_amount": 5540.0,
                "actual_amount": 0.0,
                "committed_amount": 0.0,
            },
        ],
    }


def test_budget_totals_and_no_double_counting(sample_event):
    summary = calculate_budget_summary(sample_event)
    assert summary["total_budget"] == 24000.0
    assert summary["total_spent"] == 6200.0  # 4800 + 1400
    assert summary["total_committed"] == 8180.0  # 4800 + 3380
    assert summary["total_allocated"] == 14380.0  # 6200 + 8180
    assert summary["remaining_uncommitted"] == 9620.0  # 24000 - 14380
    assert summary["percent_committed"] == 60
    assert summary["is_over_budget"] is False
    assert summary["deficit_amount"] == 0.0


def test_budget_overrun_detection(sample_event):
    sample_event["expenses"].append(
        {
            "id": "4",
            "category": "other",
            "description": "Last minute upgrades",
            "planned_amount": 500.0,
            "actual_amount": 10000.0,
            "committed_amount": 1000.0,
        }
    )
    summary = calculate_budget_summary(sample_event)
    assert summary["total_allocated"] == 25380.0
    assert summary["is_over_budget"] is True
    assert summary["deficit_amount"] == 1380.0


def test_defense_against_negative_and_malformed_values():
    malformed = {
        "total_budget": -5000,
        "expenses": [
            {
                "category": "venue",
                "description": "Test",
                "actual_amount": -200,
                "committed_amount": "invalid",
                "planned_amount": None,
            }
        ],
    }
    summary = calculate_budget_summary(malformed)
    assert summary["total_budget"] == 0.0
    assert summary["total_spent"] == 0.0
    assert summary["total_committed"] == 0.0
    assert summary["total_allocated"] == 0.0


def test_validate_expense_input():
    valid, errors = validate_expense_input(
        {
            "description": "Ceremony sound",
            "planned_amount": 500,
            "actual_amount": 250,
            "category": "photo_music",
        }
    )
    assert valid is True
    assert len(errors) == 0

    invalid, errs = validate_expense_input(
        {
            "description": "",
            "planned_amount": -100,
            "category": "not_a_category",
        }
    )
    assert invalid is False
    assert any("Description" in e for e in errs)
    assert any("Planned amount" in e for e in errs)
    assert any("Invalid category" in e for e in errs)
