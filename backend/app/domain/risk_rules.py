"""Individual deterministic risk rules for the Event Risk Radar.

Each rule takes ``(event, ctx)`` and returns a (possibly empty) list of risk dicts, where
``ctx`` carries the already-computed budget summary and timeline progress.
"""

from collections.abc import Callable
from typing import Any

from .vendors import audit_quote_completeness

DEFAULT_VENUE_CAPACITY = 999999
SEVERITY_CRITICAL = "critical"
SEVERITY_WARNING = "warning"
SEVERITY_NOTICE = "notice"
SEVERITY_RANK = {SEVERITY_CRITICAL: 1, SEVERITY_WARNING: 2, SEVERITY_NOTICE: 3}
UNKNOWN_SEVERITY_RANK = 4

RiskContext = dict[str, Any]
RiskRule = Callable[[dict[str, Any], RiskContext], list[dict[str, Any]]]


def make_risk(
    risk_id: str,
    risk_type: str,
    severity: str,
    title: str,
    evidence: str,
    consequence: str,
    actions: list[dict[str, Any]],
) -> dict[str, Any]:
    """Build a risk record with the canonical shape (always starts as ``open``)."""
    return {
        "id": risk_id,
        "type": risk_type,
        "severity": severity,
        "title": title,
        "evidence": evidence,
        "consequence": consequence,
        "recommended_actions": actions,
        "status": "open",
    }


def _ask_mara(label: str, prompt: str) -> dict[str, Any]:
    return {"label": label, "action_type": "ask_mara", "prompt": prompt}


def rule_capacity_breach(event: dict[str, Any], ctx: RiskContext) -> list[dict[str, Any]]:
    """Expected guests above a known venue capacity."""
    guests = int(event.get("expected_guests", 0))
    capacity = ctx["venue_capacity"]
    if not (guests > capacity > 0):
        return []
    diff = int(guests - capacity)
    prompt = (
        f"Our venue capacity is {capacity:.0f} but expected guests is {guests}. "
        "How should we handle this gracefully?"
    )
    return [
        make_risk(
            "risk-capacity-breach",
            "capacity_breach",
            SEVERITY_CRITICAL,
            "Venue Capacity Exceeded",
            f"Expected guest count ({guests}) exceeds confirmed venue capacity "
            f"({capacity:.0f}) by {diff} guests.",
            "Fire code safety violation or venue surcharge on the event day.",
            [
                {
                    "label": "Simulate Guest Adjustment",
                    "action_type": "open_whatif",
                    "payload": {"guest_delta": -diff},
                },
                _ask_mara("Consult Mara on Capacity Solutions", prompt),
            ],
        )
    ]


def rule_budget_deficit(event: dict[str, Any], ctx: RiskContext) -> list[dict[str, Any]]:
    """Total allocated spend above the total budget."""
    summary = ctx["budget_summary"]
    if not summary["is_over_budget"]:
        return []
    return [
        make_risk(
            "risk-budget-deficit",
            "budget_overrun",
            SEVERITY_CRITICAL,
            "Total Budget Overrun",
            f"Total allocated spend (${summary['total_allocated']:,.0f}) exceeds total budget "
            f"(${summary['total_budget']:,.0f}) by ${summary['deficit_amount']:,.0f}.",
            "Financial shortfall before final vendor retainers are disbursed.",
            [
                _ask_mara(
                    "Smart Ways to Save", "Show me smart ways to eliminate our budget deficit."
                ),
                {"label": "Open What-If Sandbox", "action_type": "open_whatif"},
            ],
        )
    ]


def _category_overrun_risk(name: str, data: dict[str, Any]) -> dict[str, Any]:
    variance = data["variance"]
    return make_risk(
        f"risk-category-overrun-{name}",
        "category_overrun",
        SEVERITY_WARNING,
        f"Category Spend Overrun: {name}",
        f"Category '{name}' allocated spend (${data['allocated']:,.0f}) exceeds planned "
        f"budget (${data['planned']:,.0f}) by ${variance:,.0f}.",
        "Diverts funds away from remaining uncommitted items.",
        [
            _ask_mara(
                "Rebalance with Mara",
                f"Our {name} budget is over by ${variance:,.0f}. "
                "Suggest reallocations from other categories.",
            )
        ],
    )


def rule_category_overruns(event: dict[str, Any], ctx: RiskContext) -> list[dict[str, Any]]:
    """One warning per category whose allocated spend exceeds a positive plan."""
    return [
        _category_overrun_risk(name, data)
        for name, data in ctx["budget_summary"]["categories"].items()
        if data["is_overrun"] and data["planned"] > 0
    ]


def rule_overdue_milestones(event: dict[str, Any], ctx: RiskContext) -> list[dict[str, Any]]:
    """Uncompleted tasks past their due date."""
    overdue = ctx["timeline_progress"]["overdue_tasks"]
    if not overdue:
        return []
    titles = ", ".join(f"'{t.get('title')}'" for t in overdue)
    return [
        make_risk(
            "risk-overdue-milestones",
            "milestone_overdue",
            SEVERITY_WARNING,
            f"{len(overdue)} Milestone(s) Overdue",
            f"Uncompleted milestone(s) past scheduled due date: {titles}.",
            "May compress downstream tasks and vendor booking lead times.",
            [
                {"label": "View Timeline", "action_type": "open_timeline"},
                _ask_mara(
                    "Reschedule Assistance",
                    "What tasks should I prioritize to get back on schedule?",
                ),
            ],
        )
    ]


def _vendor_fee_risk(vendor: dict[str, Any], missing: list[str]) -> dict[str, Any]:
    v_id = vendor.get("id", "vendor")
    name = vendor.get("name")
    return make_risk(
        f"risk-vendor-missing-{v_id}",
        "missing_quote_details",
        SEVERITY_NOTICE,
        f"Undisclosed Terms: {name}",
        f"Quote received for {name} does not disclose: {'; '.join(missing)}.",
        "Risk of surprise surcharges during final invoicing.",
        [
            {
                "label": "Review Quote & Draft Questions",
                "action_type": "open_quotes",
                "payload": {"vendor_id": v_id},
            }
        ],
    )


def rule_undisclosed_vendor_fees(event: dict[str, Any], ctx: RiskContext) -> list[dict[str, Any]]:
    """Shortlisted vendors whose quotes omit essential fee disclosures."""
    risks: list[dict[str, Any]] = []
    for vendor in event.get("vendors", []):
        if not isinstance(vendor, dict) or vendor.get("status") != "shortlist":
            continue
        is_complete, missing = audit_quote_completeness(vendor)
        if not is_complete:
            risks.append(_vendor_fee_risk(vendor, missing))
    return risks


RISK_RULES: tuple[RiskRule, ...] = (
    rule_capacity_breach,
    rule_budget_deficit,
    rule_category_overruns,
    rule_overdue_milestones,
    rule_undisclosed_vendor_fees,
)
