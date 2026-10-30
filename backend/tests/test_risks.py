"""Tests for deterministic Event Risk Radar engine."""

import pytest

from app.domain.risks import evaluate_event_risks


@pytest.fixture
def risk_event():
    return {
        "id": "risk-event",
        "name": "Wedding",
        "total_budget": 10000.0,
        "expected_guests": 150,
        "venue_capacity": 140,  # Capacity breach (150 > 140)
        "expenses": [
            {
                "category": "photo_music",
                "planned_amount": 1000.0,
                "actual_amount": 0.0,
                "committed_amount": 1600.0,  # Overrun
            }
        ],
        "tasks": [{"id": "t1", "title": "Book Venue", "due_date": "2025-05-01", "status": "todo"}],
        "vendors": [
            {"id": "v1", "name": "Studio X", "status": "shortlist", "quoted_amount": 2000.0}
        ],
        "dismissed_risk_ids": [],
    }


@pytest.fixture
def radar(risk_event):
    return evaluate_event_risks(risk_event, "2025-06-01")


def _risk_of_type(radar, risk_type):
    return next(r for r in radar["risks"] if r["type"] == risk_type)


def test_risk_radar_flags_capacity_breach_as_critical(radar):
    assert radar["critical_count"] >= 1
    cap_risk = _risk_of_type(radar, "capacity_breach")
    assert cap_risk["severity"] == "critical"
    assert "exceeds confirmed venue capacity" in cap_risk["evidence"]


@pytest.mark.parametrize("risk_type", ["category_overrun", "milestone_overdue"])
def test_risk_radar_flags_warnings(radar, risk_type):
    assert _risk_of_type(radar, risk_type)["severity"] == "warning"


def test_dismissed_risk_filter(risk_event):
    risk_event["dismissed_risk_ids"] = ["risk-capacity-breach"]
    res = evaluate_event_risks(risk_event, "2025-06-01")
    assert not any(r["id"] == "risk-capacity-breach" for r in res["risks"])
