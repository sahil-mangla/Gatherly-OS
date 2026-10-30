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
DEFAULT_CATEGORY = "other"
PERCENT_SCALE = 100
PERCENT_CAP = 100


def safe_non_negative_number(val: Any) -> float:
    """Sanitize any numeric or string input into a valid non-negative float."""
    try:
        if val is None:
            return 0.0
        num = float(val)
        return 0.0 if num < 0 else num
    except (ValueError, TypeError):
        return 0.0


def format_money(val: Any, currency: str = "$") -> str:
    """Format numeric amount into a currency-prefixed string with comma grouping."""
    num = safe_non_negative_number(val)
    return f"{currency}{num:,.0f}"


def _check_amount(
    item: dict[str, Any], key: str, default: Any, negative_msg: str, invalid_msg: str
) -> str | None:
    """Return an error message when ``item[key]`` is not a valid non-negative number."""
    try:
        if float(item.get(key, default)) < 0:
            return negative_msg
    except (ValueError, TypeError):
        return invalid_msg
    return None


_AMOUNT_RULES = (
    (
        "planned_amount",
        None,
        "Planned amount must be a positive number or zero.",
        "Planned amount must be a valid number.",
    ),
    (
        "actual_amount",
        0.0,
        "Actual amount cannot be negative.",
        "Actual amount must be a valid number.",
    ),
    (
        "committed_amount",
        0.0,
        "Committed amount cannot be negative.",
        "Committed amount must be a valid number.",
    ),
)


def validate_expense_input(item: dict[str, Any]) -> tuple[bool, list[str]]:
    """Validate expense record fields and boundary conditions."""
    if not isinstance(item, dict):
        return False, ["Expense payload must be a dictionary."]

    errors: list[str] = []
    desc = item.get("description")
    if not isinstance(desc, str) or not desc.strip():
        errors.append("Description is required and must not be empty.")

    for key, default, negative_msg, invalid_msg in _AMOUNT_RULES:
        error = _check_amount(item, key, default, negative_msg, invalid_msg)
        if error:
            errors.append(error)

    category = item.get("category")
    if category and category not in EXPENSE_CATEGORIES:
        errors.append(f"Invalid category '{category}'. Allowed: {', '.join(EXPENSE_CATEGORIES)}")

    return len(errors) == 0, errors


def _blank_category_map() -> dict[str, dict[str, Any]]:
    return {
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


def _accumulate_expenses(
    expenses: list[Any], category_map: dict[str, dict[str, Any]]
) -> tuple[float, float]:
    """Fold expenses into ``category_map``; return (total_spent, total_committed)."""
    total_spent = 0.0
    total_committed = 0.0
    for exp in expenses:
        if not isinstance(exp, dict):
            continue
        actual = safe_non_negative_number(exp.get("actual_amount", 0))
        committed = safe_non_negative_number(exp.get("committed_amount", 0))
        planned = safe_non_negative_number(exp.get("planned_amount", 0))
        total_spent += actual
        total_committed += committed

        raw_cat = exp.get("category", DEFAULT_CATEGORY)
        entry = category_map[raw_cat if raw_cat in category_map else DEFAULT_CATEGORY]
        entry["planned"] += planned
        entry["actual"] += actual
        entry["committed"] += committed
        entry["allocated"] += actual + committed
    return total_spent, total_committed


def _percent_of(part: float, whole: float) -> int:
    """Rounded percentage of ``whole``; 0 when ``whole`` is not positive."""
    return round((part / whole) * PERCENT_SCALE) if whole > 0 else 0


def _finalize_categories(category_map: dict[str, dict[str, Any]], total_budget: float) -> None:
    for entry in category_map.values():
        entry["variance"] = entry["allocated"] - entry["planned"]
        entry["is_overrun"] = entry["allocated"] > entry["planned"] and entry["planned"] > 0
        entry["percent_of_budget"] = _percent_of(entry["allocated"], total_budget)


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
    category_map = _blank_category_map()
    total_spent, total_committed = _accumulate_expenses(
        expenses if isinstance(expenses, list) else [], category_map
    )

    total_allocated = total_spent + total_committed
    _finalize_categories(category_map, total_budget)

    return {
        "total_budget": total_budget,
        "total_spent": total_spent,
        "total_committed": total_committed,
        "total_allocated": total_allocated,
        "remaining_uncommitted": total_budget - total_allocated,
        "percent_committed": min(PERCENT_CAP, _percent_of(total_allocated, total_budget)),
        "is_over_budget": total_allocated > total_budget,
        "deficit_amount": max(0.0, total_allocated - total_budget),
        "categories": category_map,
    }
