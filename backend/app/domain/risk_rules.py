"""Individual deterministic risk rules for the Event Risk Radar.

Each rule takes ``(event, ctx)`` and returns a (possibly empty) list of risk dicts, where
``ctx`` carries the already-computed budget summary and timeline progress.
"""

from typing import Any

from .numeric import format_amount, round_half_up, to_int
from .risk_collision import rule_dependency_collision
from .risk_common import (
    DEFAULT_VENUE_CAPACITY,
    SEVERITY_CRITICAL,
    SEVERITY_NOTICE,
    SEVERITY_RANK,
    SEVERITY_WARNING,
    UNKNOWN_SEVERITY_RANK,
    RiskContext,
    RiskRule,
    make_risk,
)
from .risk_common import (
    ask_mara as _ask_mara,
)
from .vendors import audit_quote_completeness

__all__ = [
    "DEFAULT_VENUE_CAPACITY",
    "RISK_RULES",
    "SEVERITY_CRITICAL",
    "SEVERITY_NOTICE",
    "SEVERITY_RANK",
    "SEVERITY_WARNING",
    "UNKNOWN_SEVERITY_RANK",
    "RiskContext",
    "RiskRule",
    "make_risk",
    "rule_budget_deficit",
    "rule_capacity_breach",
    "rule_category_overruns",
    "rule_dependency_collision",
    "rule_overdue_milestones",
    "rule_undisclosed_vendor_fees",
]


def rule_capacity_breach(event: dict[str, Any], ctx: RiskContext) -> list[dict[str, Any]]:
    """Expected guests above a known venue capacity."""
    guests = to_int(event.get("expected_guests"), 0)
    capacity = ctx["venue_capacity"]
    if not (guests > capacity > 0):
        return []
    diff = round_half_up(guests - capacity)
    limit = round_half_up(capacity)
    prompt = (
        f"Our venue capacity is {limit} but expected guests is {guests}. "
        "How should we handle this gracefully?"
    )
    return [
        make_risk(
            risk_id="risk-capacity-breach",
            risk_type="capacity_breach",
            severity=SEVERITY_CRITICAL,
            title="Venue Capacity Exceeded",
            evidence=f"Expected guest count ({guests}) exceeds confirmed venue capacity "
            f"({limit}) by {diff} guests.",
            consequence="Fire code safety violation or venue surcharge on the event day.",
            actions=[
                {
                    "label": "Simulate Guest Adjustment",
                    "action_type": "open_whatif",
                    "payload": {"guest_delta": -diff},
                },
                _ask_mara("Consult Mara on Capacity Solutions", prompt),
            ],
        )
    ]


def rule_budget_deficit(_event: dict[str, Any], ctx: RiskContext) -> list[dict[str, Any]]:
    """Total allocated spend above the total budget."""
    summary = ctx["budget_summary"]
    if not summary["is_over_budget"]:
        return []
    return [
        make_risk(
            risk_id="risk-budget-deficit",
            risk_type="budget_overrun",
            severity=SEVERITY_CRITICAL,
            title="Total Budget Overrun",
            evidence=f"Total allocated spend (${format_amount(summary['total_allocated'])}) exceeds total "
            f"budget (${format_amount(summary['total_budget'])}) by "
            f"${format_amount(summary['deficit_amount'])}.",
            consequence="Financial shortfall before final vendor retainers are disbursed.",
            actions=[
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
        risk_id=f"risk-category-overrun-{name}",
        risk_type="category_overrun",
        severity=SEVERITY_WARNING,
        title=f"Category Spend Overrun: {name}",
        evidence=f"Category '{name}' allocated spend (${format_amount(data['allocated'])}) exceeds "
        f"planned budget (${format_amount(data['planned'])}) by ${format_amount(variance)}.",
        consequence="Diverts funds away from remaining uncommitted items.",
        actions=[
            _ask_mara(
                "Rebalance with Mara",
                f"Our {name} budget is over by ${format_amount(variance)}. "
                "Suggest reallocations from other categories.",
            )
        ],
    )


def rule_category_overruns(_event: dict[str, Any], ctx: RiskContext) -> list[dict[str, Any]]:
    """One warning per category whose allocated spend exceeds a positive plan."""
    return [
        _category_overrun_risk(name, data)
        for name, data in ctx["budget_summary"]["categories"].items()
        if data["is_overrun"] and data["planned"] > 0
    ]


def rule_overdue_milestones(_event: dict[str, Any], ctx: RiskContext) -> list[dict[str, Any]]:
    """Uncompleted tasks past their due date."""
    overdue = ctx["timeline_progress"]["overdue_tasks"]
    if not overdue:
        return []
    titles = ", ".join(f"'{t.get('title')}'" for t in overdue)
    return [
        make_risk(
            risk_id="risk-overdue-milestones",
            risk_type="milestone_overdue",
            severity=SEVERITY_WARNING,
            title=f"{len(overdue)} Milestone(s) Overdue",
            evidence=f"Uncompleted milestone(s) past scheduled due date: {titles}.",
            consequence="May compress downstream tasks and vendor booking lead times.",
            actions=[
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
        risk_id=f"risk-vendor-missing-{v_id}",
        risk_type="missing_quote_details",
        severity=SEVERITY_NOTICE,
        title=f"Undisclosed Terms: {name}",
        evidence=f"Quote received for {name} does not disclose: {'; '.join(missing)}.",
        consequence="Risk of surprise surcharges during final invoicing.",
        actions=[
            {
                "label": "Review Quote & Draft Questions",
                "action_type": "open_quotes",
                "payload": {"vendor_id": v_id},
            }
        ],
    )


def rule_undisclosed_vendor_fees(event: dict[str, Any], _ctx: RiskContext) -> list[dict[str, Any]]:
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
    rule_dependency_collision,
    rule_undisclosed_vendor_fees,
)
