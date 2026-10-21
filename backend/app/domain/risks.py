"""Deterministic Event Risk Radar engine. Grounded in actual state."""

from typing import Any

from .budget import calculate_budget_summary, safe_non_negative_number
from .timeline import calculate_timeline_progress
from .vendors import audit_quote_completeness


def evaluate_event_risks(event: dict[str, Any], ref_date_str: str | None = None) -> dict[str, Any]:
    """Evaluate deterministic risk rules against active event data."""
    if not isinstance(event, dict):
        return {
            "critical_count": 0,
            "warning_count": 0,
            "notice_count": 0,
            "total_count": 0,
            "risks": [],
        }

    dismissed_ids = set(event.get("dismissed_risk_ids", []))
    risks: list[dict[str, Any]] = []

    expected_guests = int(event.get("expected_guests", 0))
    venue_capacity = safe_non_negative_number(event.get("venue_capacity", 999999))

    # Rule 1: Capacity Breach
    if expected_guests > venue_capacity and venue_capacity > 0:
        diff = int(expected_guests - venue_capacity)
        risks.append(
            {
                "id": "risk-capacity-breach",
                "type": "capacity_breach",
                "severity": "critical",
                "title": "Venue Capacity Exceeded",
                "evidence": f"Expected guest count ({expected_guests}) exceeds confirmed venue capacity ({venue_capacity:.0f}) by {diff} guests.",
                "consequence": "Fire code safety violation or venue surcharge on the event day.",
                "recommended_actions": [
                    {
                        "label": "Simulate Guest Adjustment",
                        "action_type": "open_whatif",
                        "payload": {"guest_delta": -diff},
                    },
                    {
                        "label": "Consult Mara on Capacity Solutions",
                        "action_type": "ask_mara",
                        "prompt": f"Our venue capacity is {venue_capacity:.0f} but expected guests is {expected_guests}. How should we handle this gracefully?",
                    },
                ],
                "status": "open",
            }
        )

    # Rule 2: Budget Deficit
    budget_summary = calculate_budget_summary(event)
    if budget_summary["is_over_budget"]:
        deficit = budget_summary["deficit_amount"]
        risks.append(
            {
                "id": "risk-budget-deficit",
                "type": "budget_overrun",
                "severity": "critical",
                "title": "Total Budget Overrun",
                "evidence": f"Total allocated spend (${budget_summary['total_allocated']:,.0f}) exceeds total budget (${budget_summary['total_budget']:,.0f}) by ${deficit:,.0f}.",
                "consequence": "Financial shortfall before final vendor retainers are disbursed.",
                "recommended_actions": [
                    {
                        "label": "Smart Ways to Save",
                        "action_type": "ask_mara",
                        "prompt": "Show me smart ways to eliminate our budget deficit.",
                    },
                    {"label": "Open What-If Sandbox", "action_type": "open_whatif"},
                ],
                "status": "open",
            }
        )

    # Rule 3: Category Overruns
    for cat_name, cat_data in budget_summary["categories"].items():
        if cat_data["is_overrun"] and cat_data["planned"] > 0:
            variance = cat_data["variance"]
            risks.append(
                {
                    "id": f"risk-category-overrun-{cat_name}",
                    "type": "category_overrun",
                    "severity": "warning",
                    "title": f"Category Spend Overrun: {cat_name}",
                    "evidence": f"Category '{cat_name}' allocated spend (${cat_data['allocated']:,.0f}) exceeds planned budget (${cat_data['planned']:,.0f}) by ${variance:,.0f}.",
                    "consequence": "Diverts funds away from remaining uncommitted items.",
                    "recommended_actions": [
                        {
                            "label": "Rebalance with Mara",
                            "action_type": "ask_mara",
                            "prompt": f"Our {cat_name} budget is over by ${variance:,.0f}. Suggest reallocations from other categories.",
                        }
                    ],
                    "status": "open",
                }
            )

    # Rule 4: Overdue Milestones
    tasks = event.get("tasks", [])
    timeline_progress = calculate_timeline_progress(tasks, ref_date_str)
    if timeline_progress["overdue_tasks"]:
        overdue_titles = ", ".join(
            f"'{t.get('title')}'" for t in timeline_progress["overdue_tasks"]
        )
        risks.append(
            {
                "id": "risk-overdue-milestones",
                "type": "milestone_overdue",
                "severity": "warning",
                "title": f"{len(timeline_progress['overdue_tasks'])} Milestone(s) Overdue",
                "evidence": f"Uncompleted milestone(s) past scheduled due date: {overdue_titles}.",
                "consequence": "May compress downstream tasks and vendor booking lead times.",
                "recommended_actions": [
                    {"label": "View Timeline", "action_type": "open_timeline"},
                    {
                        "label": "Reschedule Assistance",
                        "action_type": "ask_mara",
                        "prompt": "What tasks should I prioritize to get back on schedule?",
                    },
                ],
                "status": "open",
            }
        )

    # Rule 5: Undisclosed Vendor Fees
    vendors = event.get("vendors", [])
    for v in vendors:
        if not isinstance(v, dict):
            continue
        if v.get("status") == "shortlist":
            is_complete, missing = audit_quote_completeness(v)
            if not is_complete:
                v_id = v.get("id", "vendor")
                risks.append(
                    {
                        "id": f"risk-vendor-missing-{v_id}",
                        "type": "missing_quote_details",
                        "severity": "notice",
                        "title": f"Undisclosed Terms: {v.get('name')}",
                        "evidence": f"Quote received for {v.get('name')} does not disclose: {'; '.join(missing)}.",
                        "consequence": "Risk of surprise surcharges during final invoicing.",
                        "recommended_actions": [
                            {
                                "label": "Review Quote & Draft Questions",
                                "action_type": "open_quotes",
                                "payload": {"vendor_id": v_id},
                            }
                        ],
                        "status": "open",
                    }
                )

    # Filter dismissed
    active_risks = [r for r in risks if r["id"] not in dismissed_ids]

    severity_rank = {"critical": 1, "warning": 2, "notice": 3}
    active_risks.sort(key=lambda r: severity_rank.get(r["severity"], 4))

    return {
        "critical_count": sum(1 for r in active_risks if r["severity"] == "critical"),
        "warning_count": sum(1 for r in active_risks if r["severity"] == "warning"),
        "notice_count": sum(1 for r in active_risks if r["severity"] == "notice"),
        "total_count": len(active_risks),
        "risks": active_risks,
    }
