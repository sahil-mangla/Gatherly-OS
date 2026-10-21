"""Directed Acyclic Graph (DAG) task scheduler and dependency resolver."""

from datetime import date
from typing import Any

from .timeline_dates import parse_date
from .timeline_scheduler import evaluate_reschedule

TASK_PRIORITIES = ["low", "medium", "high", "critical"]
TASK_STATUSES = ["todo", "in_progress", "done"]


def validate_task(task: dict[str, Any]) -> tuple[bool, list[str]]:
    """Validate task integrity and required date contracts."""
    errors: list[str] = []
    if not isinstance(task, dict):
        return False, ["Task must be a dictionary."]

    title = task.get("title")
    if not title or not isinstance(title, str) or not title.strip():
        errors.append("Task title is required.")

    due_date = task.get("due_date")
    if not due_date or parse_date(str(due_date)) is None:
        errors.append("Valid due_date in YYYY-MM-DD format is required.")

    prio = task.get("priority")
    if prio and prio not in TASK_PRIORITIES:
        errors.append(f"Invalid priority '{prio}'. Allowed: {', '.join(TASK_PRIORITIES)}")

    status = task.get("status")
    if status and status not in TASK_STATUSES:
        errors.append(f"Invalid status '{status}'. Allowed: {', '.join(TASK_STATUSES)}")

    return len(errors) == 0, errors


def check_circular_dependencies(tasks: list[dict[str, Any]]) -> tuple[bool, list[str]]:
    """Detect cycles in task dependency graph using depth-first search (DFS)."""
    task_map = {t["id"]: t for t in tasks if isinstance(t, dict) and "id" in t}
    visited: set[str] = set()
    recursion_stack: set[str] = set()

    def dfs(task_id: str, path: list[str]) -> tuple[bool, list[str]]:
        visited.add(task_id)
        recursion_stack.add(task_id)
        path.append(task_id)

        task = task_map.get(task_id, {})
        deps = task.get("depends_on", [])
        if not isinstance(deps, list):
            deps = []

        for dep_id in deps:
            if dep_id not in task_map:
                continue
            if dep_id not in visited:
                has_cycle, cycle_path = dfs(dep_id, path)
                if has_cycle:
                    return True, cycle_path
            elif dep_id in recursion_stack:
                return True, [*path, dep_id]

        recursion_stack.remove(task_id)
        path.pop()
        return False, []

    for t in tasks:
        t_id = t.get("id")
        if t_id and t_id not in visited:
            has_cycle, cycle_path = dfs(t_id, [])
            if has_cycle:
                return True, cycle_path

    return False, []


def calculate_timeline_progress(
    tasks: list[dict[str, Any]], ref_date_str: str | None = None
) -> dict[str, Any]:
    """Calculate milestone completion statistics, overdue tasks, and next item."""
    ref_date = parse_date(ref_date_str) if ref_date_str else date.today()
    if ref_date is None:
        ref_date = date.today()

    total = len(tasks)
    completed = 0
    in_progress = 0
    todo = 0
    overdue_tasks: list[dict[str, Any]] = []
    upcoming_tasks: list[dict[str, Any]] = []

    for t in tasks:
        if not isinstance(t, dict):
            continue
        status = t.get("status", "todo")
        if status == "done":
            completed += 1
        else:
            if status == "in_progress":
                in_progress += 1
            else:
                todo += 1

            due = parse_date(str(t.get("due_date", "")))
            if due:
                if due < ref_date:
                    overdue_tasks.append(t)
                else:
                    upcoming_tasks.append(t)

    upcoming_tasks.sort(key=lambda x: str(x.get("due_date", "")))
    percent_complete = round((completed / total) * 100) if total > 0 else 0

    return {
        "total": total,
        "completed": completed,
        "in_progress": in_progress,
        "todo": todo,
        "percent_complete": percent_complete,
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
