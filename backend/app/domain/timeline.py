"""Directed Acyclic Graph (DAG) task scheduler and dependency resolver."""

from collections.abc import Iterator
from datetime import date
from typing import Any

from .budget import PERCENT_SCALE
from .timeline_dates import parse_date
from .timeline_scheduler import evaluate_reschedule

TASK_PRIORITIES = ["low", "medium", "high", "critical"]
TASK_STATUSES = ["todo", "in_progress", "done"]


def _title_errors(task: dict[str, Any]) -> list[str]:
    title = task.get("title")
    if isinstance(title, str) and title.strip():
        return []
    return ["Task title is required."]


def _due_date_errors(task: dict[str, Any]) -> list[str]:
    due_date = task.get("due_date")
    if due_date and parse_date(str(due_date)) is not None:
        return []
    return ["Valid due_date in YYYY-MM-DD format is required."]


def _choice_errors(value: Any, allowed: list[str], label: str) -> list[str]:
    if not value or value in allowed:
        return []
    return [f"Invalid {label} '{value}'. Allowed: {', '.join(allowed)}"]


def validate_task(task: dict[str, Any]) -> tuple[bool, list[str]]:
    """Validate task integrity and required date contracts."""
    if not isinstance(task, dict):
        return False, ["Task must be a dictionary."]

    errors = [
        *_title_errors(task),
        *_due_date_errors(task),
        *_choice_errors(task.get("priority"), TASK_PRIORITIES, "priority"),
        *_choice_errors(task.get("status"), TASK_STATUSES, "status"),
    ]
    return len(errors) == 0, errors


def _dependencies_of(task_map: dict[Any, dict[str, Any]], task_id: Any) -> list[Any]:
    deps = task_map.get(task_id, {}).get("depends_on", [])
    return deps if isinstance(deps, list) else []


def _next_step(
    deps: Iterator[Any], task_map: dict[Any, Any], visited: set[Any], on_path: set[Any]
) -> tuple[Any, Any]:
    """Advance one dependency iterator; return (node closing a cycle, next node to visit)."""
    for dep_id in deps:
        if dep_id not in task_map:
            continue
        if dep_id in on_path:
            return dep_id, None
        if dep_id not in visited:
            return None, dep_id
    return None, None


def _find_cycle_from(root: Any, task_map: dict[Any, Any], visited: set[Any]) -> list[Any] | None:
    """Iterative DFS from ``root``; return the path ending at the repeated node, if any."""
    visited.add(root)
    path = [root]
    on_path = {root}
    frames = [iter(_dependencies_of(task_map, root))]
    while frames:
        closer, nxt = _next_step(frames[-1], task_map, visited, on_path)
        if closer is not None:
            return [*path, closer]
        if nxt is None:
            on_path.discard(path.pop())
            frames.pop()
            continue
        visited.add(nxt)
        on_path.add(nxt)
        path.append(nxt)
        frames.append(iter(_dependencies_of(task_map, nxt)))
    return None


def check_circular_dependencies(tasks: list[dict[str, Any]]) -> tuple[bool, list[str]]:
    """Detect cycles in the task dependency graph with an iterative DFS (no recursion limit)."""
    valid = [t for t in tasks if isinstance(t, dict)]
    task_map = {t["id"]: t for t in valid if "id" in t}
    visited: set[Any] = set()

    for t in valid:
        t_id = t.get("id")
        if t_id and t_id not in visited:
            cycle = _find_cycle_from(t_id, task_map, visited)
            if cycle is not None:
                return True, cycle
    return False, []


def _resolve_ref_date(ref_date_str: str | None) -> date:
    parsed = parse_date(ref_date_str) if ref_date_str else None
    return parsed or date.today()


def _bucket_open_task(
    task: dict[str, Any],
    ref_date: date,
    overdue: list[dict[str, Any]],
    upcoming: list[dict[str, Any]],
) -> None:
    due = parse_date(str(task.get("due_date", "")))
    if due is None:
        return
    (overdue if due < ref_date else upcoming).append(task)


def calculate_timeline_progress(
    tasks: list[dict[str, Any]], ref_date_str: str | None = None
) -> dict[str, Any]:
    """Calculate milestone completion statistics, overdue tasks, and next item."""
    ref_date = _resolve_ref_date(ref_date_str)
    total = len(tasks)
    counts = {"done": 0, "in_progress": 0, "todo": 0}
    overdue_tasks: list[dict[str, Any]] = []
    upcoming_tasks: list[dict[str, Any]] = []

    for t in tasks:
        if not isinstance(t, dict):
            continue
        status = t.get("status", "todo")
        counts[status if status in ("done", "in_progress") else "todo"] += 1
        if status != "done":
            _bucket_open_task(t, ref_date, overdue_tasks, upcoming_tasks)

    upcoming_tasks.sort(key=lambda x: str(x.get("due_date", "")))
    return {
        "total": total,
        "completed": counts["done"],
        "in_progress": counts["in_progress"],
        "todo": counts["todo"],
        "percent_complete": round((counts["done"] / total) * PERCENT_SCALE) if total > 0 else 0,
        "overdue_tasks": overdue_tasks,
        "next_task": upcoming_tasks[0] if upcoming_tasks else None,
        "upcoming_tasks": upcoming_tasks,
    }


__all__ = [
    "TASK_PRIORITIES",
    "TASK_STATUSES",
    "parse_date",
    "validate_task",
    "check_circular_dependencies",
    "calculate_timeline_progress",
    "evaluate_reschedule",
]
