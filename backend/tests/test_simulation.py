"""Tests for MiroFish-inspired multi-factor ripple simulation engine."""

import pytest

from app.domain.simulation import simulate_ripple


@pytest.fixture
def sample_event():
    return {
        "id": "sim-event",
        "name": "Summer Gala",
        "total_budget": 10000.0,
        "expected_guests": 100,
        "venue_capacity": 120,
        "expenses": [
            {
                "category": "catering",
                "planned_amount": 4000.0,
                "actual_amount": 1000.0,
                "committed_amount": 2000.0,
                "cost_per_guest": 30.0,
            }
        ],
        "tasks": [{"id": "t1", "title": "Finalize guest seating chart", "due_date": "2025-07-01"}],
    }


def test_simulate_ripple_capacity_breach(sample_event):
    # Inject disruption: +25 guests (100 -> 125, exceeding venue capacity of 120)
    result = simulate_ripple(sample_event, {"guest_delta": 25, "catering_variance_pct": 10.0})

    assert result["projected"]["guests"] == 125
    assert result["projected"]["capacity_breach"] is True
    assert result["projected"]["excess_guests"] == 5
    assert any("CRITICAL" in n for n in result["narrative"])
    assert any("seating" in t["title"] for t in result["affected_tasks"])


def test_simulate_ripple_within_safe_limits(sample_event):
    # Safe scenario: +10 guests (110 <= 120)
    result = simulate_ripple(sample_event, {"guest_delta": 10, "catering_variance_pct": 0.0})

    assert result["projected"]["guests"] == 110
    assert result["projected"]["capacity_breach"] is False
    assert any("comfortably holds" in n for n in result["narrative"])
