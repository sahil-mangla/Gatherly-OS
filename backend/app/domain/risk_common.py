"""Shared building blocks for the Event Risk Radar rules (constants and the risk factory)."""

from collections.abc import Callable
from typing import Any

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


def ask_mara(label: str, prompt: str) -> dict[str, Any]:
    """Recommended action that opens a prefilled question for Mara."""
    return {"label": label, "action_type": "ask_mara", "prompt": prompt}
