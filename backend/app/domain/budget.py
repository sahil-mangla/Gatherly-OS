"""Authoritative budget calculation engine and financial constraint validator.

Application code owns financial truth. No LLM arithmetic.
"""

from typing import Any

EXPENSE_CATEGORIES = [
    "venue",
    "catering",
    "design",
    "photo_music",
    "contingency",
    "other",
]


def safe_non_negative_number(val: Any) -> float:
    """Sanitize any numeric or string input into a valid non-negative float."""
    try:
        if val is None:
            return 0.0
        num = float(val)
        return 0.0 if num < 0 else num
    except (ValueError, TypeError):
        return 0.0


def validate_expense_input(item: dict[str, Any]) -> tuple[bool, list[str]]:
    """Validate expense record fields and boundary conditions."""
    errors: list[str] = []
    if not isinstance(item, dict):
        return False, ["Expense payload must be a dictionary."]

    desc = item.get("description")
    if not desc or not isinstance(desc, str) or not desc.strip():
        errors.append("Description is required and must not be empty.")

    planned_raw = item.get("planned_amount")
    try:
        planned = float(planned_raw)  # type: ignore
        if planned < 0:
            errors.append("Planned amount must be a positive number or zero.")
    except (ValueError, TypeError):
        errors.append("Planned amount must be a valid number.")

    try:
        actual = float(item.get("actual_amount", 0.0))
        if actual < 0:
            errors.append("Actual amount cannot be negative.")
    except (ValueError, TypeError):
        errors.append("Actual amount must be a valid number.")

    try:
        committed = float(item.get("committed_amount", 0.0))
        if committed < 0:
            errors.append("Committed amount cannot be negative.")
    except (ValueError, TypeError):
        errors.append("Committed amount must be a valid number.")

    category = item.get("category")
    if category and category not in EXPENSE_CATEGORIES:
        errors.append(f"Invalid category '{category}'. Allowed: {', '.join(EXPENSE_CATEGORIES)}")

    return len(errors) == 0, errors


def calculate_budget_summary(event: dict[str, Any]) -> dict[str, Any]:
    """Compute authoritative financial summaries for an event.

    Formula guarantees:
    - total_spent = sum(actual_amount)
    - total_committed = sum(committed_amount)
    - total_allocated = total_spent + total_committed (prevents double-counting)
    - remaining_uncommitted = total_budget - total_allocated
    """
    if not isinstance(event, dict):
        raise ValueError("calculate_budget_summary requires a valid event dictionary.")

    total_budget = safe_non_negative_number(event.get("total_budget", 0))
    expenses = event.get("expenses", [])
    if not isinstance(expenses, list):
        expenses = []

    total_spent = 0.0
    total_committed = 0.0

    category_map: dict[str, dict[str, Any]] = {
        cat: {
            "category": cat,
            "planned": 0.0,
            "actual": 0.0,
            "committed": 0.0,
            "allocated": 0.0,
            "variance": 0.0,
            "percent_of_budget": 0,
            "is_overrun": False,
        }
        for cat in EXPENSE_CATEGORIES
    }

    for exp in expenses:
        if not isinstance(exp, dict):
            continue
        actual = safe_non_negative_number(exp.get("actual_amount", 0))
        committed = safe_non_negative_number(exp.get("committed_amount", 0))
        planned = safe_non_negative_number(exp.get("planned_amount", 0))

        total_spent += actual
        total_committed += committed

        raw_cat = exp.get("category", "other")
        cat = raw_cat if raw_cat in category_map else "other"

        category_map[cat]["planned"] += planned
        category_map[cat]["actual"] += actual
        category_map[cat]["committed"] += committed
        category_map[cat]["allocated"] += actual + committed

    total_allocated = total_spent + total_committed
    remaining_uncommitted = total_budget - total_allocated
    percent_committed = (
        min(100, round((total_allocated / total_budget) * 100)) if total_budget > 0 else 0
    )
    is_over_budget = total_allocated > total_budget
    deficit_amount = max(0.0, total_allocated - total_budget)

    for entry in category_map.values():
        entry["variance"] = entry["allocated"] - entry["planned"]
        entry["is_overrun"] = entry["allocated"] > entry["planned"] and entry["planned"] > 0
        entry["percent_of_budget"] = (
            round((entry["allocated"] / total_budget) * 100) if total_budget > 0 else 0
        )

    return {
        "total_budget": total_budget,
        "total_spent": total_spent,
        "total_committed": total_committed,
        "total_allocated": total_allocated,
        "remaining_uncommitted": remaining_uncommitted,
        "percent_committed": percent_committed,
        "is_over_budget": is_over_budget,
        "deficit_amount": deficit_amount,
        "categories": category_map,
    }
