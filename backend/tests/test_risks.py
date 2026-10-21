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


def test_risk_radar_rule_evaluations(risk_event):
    res = evaluate_event_risks(risk_event, "2025-06-01")

    assert res["critical_count"] >= 1
    # Check capacity breach
    cap_risk = next(r for r in res["risks"] if r["type"] == "capacity_breach")
    assert cap_risk["severity"] == "critical"
    assert "exceeds confirmed venue capacity" in cap_risk["evidence"]

    # Check category overrun
    cat_risk = next(r for r in res["risks"] if r["type"] == "category_overrun")
    assert cat_risk["severity"] == "warning"

    # Check overdue milestone
    mile_risk = next(r for r in res["risks"] if r["type"] == "milestone_overdue")
    assert mile_risk["severity"] == "warning"


def test_dismissed_risk_filter(risk_event):
    risk_event["dismissed_risk_ids"] = ["risk-capacity-breach"]
    res = evaluate_event_risks(risk_event, "2025-06-01")
    assert not any(r["id"] == "risk-capacity-breach" for r in res["risks"])
