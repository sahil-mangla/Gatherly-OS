"""Timeline rescheduling and dependency collision evaluation."""

from typing import Any

from .timeline_dates import parse_date


def evaluate_reschedule(
    tasks: list[dict[str, Any]], task_id: str, new_date_str: str
) -> dict[str, Any]:
    """Evaluate rescheduling a task due date and detect downstream collisions."""
    target_task = next((t for t in tasks if t.get("id") == task_id), None)
    if not target_task:
        raise ValueError(f"Task with id '{task_id}' not found.")

    new_date = parse_date(new_date_str)
    if not new_date:
        raise ValueError(f"Invalid target date: '{new_date_str}'")

    conflicts: list[dict[str, Any]] = []
    impacted_dependents: list[dict[str, Any]] = []

    if target_task.get("is_fixed_deadline"):
        conflicts.append(
            {
                "type": "fixed_deadline_override",
                "task_id": target_task["id"],
                "title": target_task.get("title", ""),
                "severity": "warning",
                "message": f"'{target_task.get('title')}' is designated as a fixed deadline.",
            }
        )

    def find_dependents(current_id: str) -> list[dict[str, Any]]:
        return [
            t
            for t in tasks
            if isinstance(t.get("depends_on"), list) and current_id in t["depends_on"]
        ]

    queue = find_dependents(task_id)
    visited: set[str] = set()

    while queue:
        dep = queue.pop(0)
        dep_id = dep.get("id")
        if not dep_id or dep_id in visited:
            continue
        visited.add(dep_id)

        dep_due = parse_date(str(dep.get("due_date", "")))
        if dep_due and dep_due <= new_date:
            conflicts.append(
                {
                    "type": "dependency_precedence_violation",
                    "dependent_id": dep_id,
                    "dependent_title": dep.get("title", ""),
                    "prerequisite_id": target_task["id"],
                    "prerequisite_title": target_task.get("title", ""),
                    "severity": "critical" if dep.get("is_fixed_deadline") else "warning",
                    "message": (
                        f"Dependent task '{dep.get('title')}' ({dep.get('due_date')}) "
                        f"would be due on or before prerequisite '{target_task.get('title')}' ({new_date_str})."
                    ),
                }
            )

        impacted_dependents.append(dep)
        queue.extend(find_dependents(dep_id))

    return {
        "task_id": task_id,
        "original_date": target_task.get("due_date"),
        "proposed_date": new_date_str,
        "has_conflicts": len(conflicts) > 0,
        "conflicts": conflicts,
        "impacted_dependents_count": len(impacted_dependents),
        "impacted_dependents": [
            {"id": d.get("id"), "title": d.get("title"), "due_date": d.get("due_date")}
            for d in impacted_dependents
        ],
    }
