"""Timeline rescheduling and dependency collision evaluation."""

from collections import deque
from datetime import date
from typing import Any

from .timeline_dates import parse_date

HASHABLE_ID_TYPES = (str, int)


def _build_dependents(tasks: list[dict[str, Any]]) -> dict[Any, list[dict[str, Any]]]:
    """Map each task id to the tasks that depend on it (task-list order), in one pass."""
    dependents: dict[Any, list[dict[str, Any]]] = {}
    for task in tasks:
        deps = task.get("depends_on") if isinstance(task, dict) else None
        if not isinstance(deps, list):
            continue
        for dep_id in dict.fromkeys(d for d in deps if isinstance(d, HASHABLE_ID_TYPES)):
            dependents.setdefault(dep_id, []).append(task)
    return dependents


def _collect_dependents(tasks: list[dict[str, Any]], task_id: str) -> list[dict[str, Any]]:
    """Breadth-first transitive dependents of ``task_id``; O(tasks + edges)."""
    dependents = _build_dependents(tasks)
    queue = deque(dependents.get(task_id, []))
    visited: set[Any] = set()
    ordered: list[dict[str, Any]] = []
    while queue:
        dep = queue.popleft()
        dep_id = dep.get("id")
        if not dep_id or dep_id in visited:
            continue
        visited.add(dep_id)
        ordered.append(dep)
        queue.extend(dependents.get(dep_id, []))
    return ordered


def _fixed_deadline_conflict(target: dict[str, Any]) -> dict[str, Any]:
    return {
        "type": "fixed_deadline_override",
        "task_id": target["id"],
        "title": target.get("title", ""),
        "severity": "warning",
        "message": f"'{target.get('title')}' is designated as a fixed deadline.",
    }


def _precedence_conflict(
    dep: dict[str, Any], target: dict[str, Any], new_date: date, new_date_str: str
) -> dict[str, Any] | None:
    """Conflict record when ``dep`` would fall due on or before the moved prerequisite."""
    dep_due = parse_date(str(dep.get("due_date", "")))
    if not dep_due or dep_due > new_date:
        return None
    return {
        "type": "dependency_precedence_violation",
        "dependent_id": dep.get("id"),
        "dependent_title": dep.get("title", ""),
        "prerequisite_id": target["id"],
        "prerequisite_title": target.get("title", ""),
        "severity": "critical" if dep.get("is_fixed_deadline") else "warning",
        "message": (
            f"Dependent task '{dep.get('title')}' ({dep.get('due_date')}) "
            f"would be due on or before prerequisite '{target.get('title')}' ({new_date_str})."
        ),
    }


def _find_task(tasks: list[dict[str, Any]], task_id: str) -> dict[str, Any]:
    for task in tasks:
        if isinstance(task, dict) and task.get("id") == task_id:
            return task
    raise ValueError(f"Task with id '{task_id}' not found.")


def evaluate_reschedule(
    tasks: list[dict[str, Any]], task_id: str, new_date_str: str
) -> dict[str, Any]:
    """Evaluate rescheduling a task due date and detect downstream collisions."""
    target = _find_task(tasks, task_id)

    new_date = parse_date(new_date_str)
    if not new_date:
        raise ValueError(f"Invalid target date: '{new_date_str}'")

    conflicts: list[dict[str, Any]] = []
    if target.get("is_fixed_deadline"):
        conflicts.append(_fixed_deadline_conflict(target))

    impacted = _collect_dependents(tasks, task_id)
    for dep in impacted:
        conflict = _precedence_conflict(dep, target, new_date, new_date_str)
        if conflict:
            conflicts.append(conflict)

    return {
        "task_id": task_id,
        "original_date": target.get("due_date"),
        "proposed_date": new_date_str,
        "has_conflicts": len(conflicts) > 0,
        "conflicts": conflicts,
        "impacted_dependents_count": len(impacted),
        "impacted_dependents": [
            {"id": d.get("id"), "title": d.get("title"), "due_date": d.get("due_date")}
            for d in impacted
        ],
    }
