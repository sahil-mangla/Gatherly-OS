"""Deterministic Event Risk Radar engine. Grounded in actual state."""

from typing import Any

from .budget import calculate_budget_summary, safe_non_negative_number
from .risk_rules import (
    DEFAULT_VENUE_CAPACITY,
    RISK_RULES,
    SEVERITY_CRITICAL,
    SEVERITY_NOTICE,
    SEVERITY_RANK,
    SEVERITY_WARNING,
    UNKNOWN_SEVERITY_RANK,
)
from .timeline import calculate_timeline_progress


def _empty_report() -> dict[str, Any]:
    return {
        "critical_count": 0,
        "warning_count": 0,
        "notice_count": 0,
        "total_count": 0,
        "risks": [],
    }


def _count(risks: list[dict[str, Any]], severity: str) -> int:
    return sum(1 for r in risks if r["severity"] == severity)


def evaluate_event_risks(event: dict[str, Any], ref_date_str: str | None = None) -> dict[str, Any]:
    """Evaluate deterministic risk rules against active event data."""
    if not isinstance(event, dict):
        return _empty_report()

    ctx = {
        "venue_capacity": safe_non_negative_number(
            event.get("venue_capacity", DEFAULT_VENUE_CAPACITY)
        ),
        "budget_summary": calculate_budget_summary(event),
        "timeline_progress": calculate_timeline_progress(event.get("tasks", []), ref_date_str),
    }
    dismissed_ids = set(event.get("dismissed_risk_ids", []))

    risks = [risk for rule in RISK_RULES for risk in rule(event, ctx)]
    active = [r for r in risks if r["id"] not in dismissed_ids]
    active.sort(key=lambda r: SEVERITY_RANK.get(r["severity"], UNKNOWN_SEVERITY_RANK))

    return {
        "critical_count": _count(active, SEVERITY_CRITICAL),
        "warning_count": _count(active, SEVERITY_WARNING),
        "notice_count": _count(active, SEVERITY_NOTICE),
        "total_count": len(active),
        "risks": active,
    }
