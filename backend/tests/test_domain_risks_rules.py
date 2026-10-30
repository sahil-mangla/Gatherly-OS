"""Every risk-radar rule branch, in isolation and through the aggregator."""

from app.domain.risk_rules import (
    RISK_RULES,
    make_risk,
    rule_budget_deficit,
    rule_capacity_breach,
    rule_category_overruns,
    rule_overdue_milestones,
    rule_undisclosed_vendor_fees,
)
from app.domain.risks import evaluate_event_risks

REF = "2025-06-01"


def _ctx(event, capacity=999999):
    from app.domain.budget import calculate_budget_summary
    from app.domain.timeline import calculate_timeline_progress

    return {
        "venue_capacity": capacity,
        "budget_summary": calculate_budget_summary(event),
        "timeline_progress": calculate_timeline_progress(event.get("tasks", []), REF),
    }


def test_make_risk_shape():
    risk = make_risk("id", "t", "notice", "T", "E", "C", [{"label": "x"}])
    assert list(risk) == [
        "id",
        "type",
        "severity",
        "title",
        "evidence",
        "consequence",
        "recommended_actions",
        "status",
    ]
    assert risk["status"] == "open"


def test_rule_list_has_six_rules():
    assert len(RISK_RULES) == 6


def test_capacity_rule_branches():
    over = {"expected_guests": 150}
    (risk,) = rule_capacity_breach(over, _ctx(over, 140))
    assert risk["severity"] == "critical"
    assert risk["recommended_actions"][0]["payload"] == {"guest_delta": -10}
    assert "by 10 guests" in risk["evidence"]
    assert rule_capacity_breach({"expected_guests": 140}, _ctx({}, 140)) == []
    assert rule_capacity_breach(over, _ctx(over, 0)) == []  # unknown (zero) capacity: no breach
    assert rule_capacity_breach({}, _ctx({}, 100)) == []  # missing guests default to 0


def test_budget_deficit_rule_branches():
    over = {"total_budget": 100, "expenses": [{"actual_amount": 250, "category": "venue"}]}
    (risk,) = rule_budget_deficit(over, _ctx(over))
    assert risk["id"] == "risk-budget-deficit"
    assert "$150" in risk["evidence"]
    ok = {"total_budget": 1000, "expenses": []}
    assert rule_budget_deficit(ok, _ctx(ok)) == []


def test_category_overrun_rule_branches():
    event = {
        "total_budget": 10000,
        "expenses": [
            {"category": "venue", "planned_amount": 100, "actual_amount": 300},
            {"category": "design", "planned_amount": 500, "actual_amount": 100},
        ],
    }
    risks = rule_category_overruns(event, _ctx(event))
    assert [r["id"] for r in risks] == ["risk-category-overrun-venue"]
    assert "$200" in risks[0]["recommended_actions"][0]["prompt"]
    assert rule_category_overruns({"expenses": []}, _ctx({"expenses": []})) == []


def test_overdue_rule_branches():
    late = {"tasks": [{"id": "a", "title": "Pay", "due_date": "2025-05-01", "status": "todo"}]}
    (risk,) = rule_overdue_milestones(late, _ctx(late))
    assert risk["title"] == "1 Milestone(s) Overdue"
    assert "'Pay'" in risk["evidence"]
    done = {"tasks": [{"id": "a", "title": "Pay", "due_date": "2025-05-01", "status": "done"}]}
    assert rule_overdue_milestones(done, _ctx(done)) == []


def test_vendor_rule_branches():
    complete = {
        "id": "v2",
        "name": "Full",
        "status": "shortlist",
        "inclusions": ["staff", "cleanup", "overtime", "refund"],
    }
    event = {
        "vendors": [
            {"id": "v1", "name": "Thin", "status": "shortlist"},
            {"id": "v3", "name": "Booked", "status": "booked"},
            "garbage",
            complete,
            {"name": "NoId", "status": "shortlist"},
        ]
    }
    ids = [r["id"] for r in rule_undisclosed_vendor_fees(event, _ctx(event))]
    assert ids == ["risk-vendor-missing-v1", "risk-vendor-missing-vendor"]
    assert rule_undisclosed_vendor_fees({}, _ctx({})) == []


def test_non_dict_event_returns_empty_report():
    assert evaluate_event_risks(None) == {
        "critical_count": 0,
        "warning_count": 0,
        "notice_count": 0,
        "total_count": 0,
        "risks": [],
    }


def test_aggregator_sorts_by_severity_and_counts():
    event = {
        "total_budget": 100,
        "expected_guests": 50,
        "venue_capacity": 10,
        "expenses": [{"category": "venue", "planned_amount": 10, "actual_amount": 300}],
        "tasks": [{"id": "a", "title": "Pay", "due_date": "2025-05-01", "status": "todo"}],
        "vendors": [{"id": "v", "name": "V", "status": "shortlist"}],
    }
    res = evaluate_event_risks(event, REF)
    severities = [r["severity"] for r in res["risks"]]
    assert severities == sorted(severities, key=["critical", "warning", "notice"].index)
    assert (res["critical_count"], res["warning_count"], res["notice_count"]) == (2, 2, 1)
    assert res["total_count"] == 5


def test_all_dismissed_leaves_nothing():
    event = {
        "expected_guests": 50,
        "venue_capacity": 10,
        "dismissed_risk_ids": ["risk-capacity-breach"],
    }
    assert evaluate_event_risks(event, REF)["total_count"] == 0
