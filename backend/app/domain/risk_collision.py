"""Dependency-collision risk rule: open tasks due before a prerequisite that is still open."""

from datetime import date
from typing import Any

from .risk_common import SEVERITY_WARNING, RiskContext, ask_mara, make_risk
from .timeline_dates import parse_date

MAX_TITLES_SHOWN = 3
HASHABLE_ID_TYPES = (str, int)


def _due(task: dict[str, Any]) -> date | None:
    value = task.get("due_date")
    return parse_date(value) if isinstance(value, str) else None


def _prereq_due_after(dep: dict[str, Any] | None, due: date) -> bool:
    """True when ``dep`` is an open task whose due date is strictly later than ``due``."""
    if dep is None or dep.get("status") == "done":
        return False
    dep_due = _due(dep)
    return dep_due is not None and dep_due > due


def _is_collision(task: dict[str, Any], by_id: dict[Any, dict[str, Any]]) -> bool:
    """True for an open task that has an open, existing prerequisite due strictly later."""
    due = _due(task)
    deps = task.get("depends_on")
    if task.get("status") == "done" or due is None or not isinstance(deps, list):
        return False
    return any(
        _prereq_due_after(by_id.get(d) if isinstance(d, HASHABLE_ID_TYPES) else None, due)
        for d in deps
    )


def _label(task: dict[str, Any]) -> str:
    return str(task.get("title") or task.get("id") or "Untitled")


def _collision_evidence(colliding: list[dict[str, Any]]) -> str:
    shown = ", ".join(f"'{_label(t)}'" for t in colliding[:MAX_TITLES_SHOWN])
    extra = len(colliding) - MAX_TITLES_SHOWN
    more = f" and {extra} more" if extra > 0 else ""
    return f"Due before a prerequisite that is still open: {shown}{more}."


def rule_dependency_collision(event: dict[str, Any], _ctx: RiskContext) -> list[dict[str, Any]]:
    """One warning summarising open tasks scheduled earlier than a prerequisite they depend on."""
    raw = event.get("tasks")
    tasks = [t for t in raw if isinstance(t, dict)] if isinstance(raw, list) else []
    by_id = {t["id"]: t for t in tasks if isinstance(t.get("id"), HASHABLE_ID_TYPES)}
    colliding = [t for t in tasks if _is_collision(t, by_id)]
    if not colliding:
        return []
    return [
        make_risk(
            risk_id="risk-dependency-collision",
            risk_type="dependency_collision",
            severity=SEVERITY_WARNING,
            title=f"{len(colliding)} Dependency Collision(s)",
            evidence=_collision_evidence(colliding),
            consequence="Work may be due before its prerequisites finish, forcing last-minute rescheduling.",
            actions=[
                {"label": "View Timeline", "action_type": "open_timeline"},
                ask_mara(
                    "Resolve Dependency Conflicts",
                    "Which tasks are scheduled before their prerequisites, and how should I reorder them?",
                ),
            ],
        )
    ]
