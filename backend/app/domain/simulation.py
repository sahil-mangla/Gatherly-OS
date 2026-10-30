"""MiroFish-Inspired Multi-Domain Celebration Simulation Engine.

Simulates cross-cutting ripple effects across Budget, Venue Capacity,
Timeline Pressure, and Vendor Requirements without mutating ground truth.
"""

from typing import Any

from .budget import PERCENT_SCALE, calculate_budget_summary
from .numeric import (
    format_amount,
    format_signed_tenths,
    number_or,
    round_half_up,
    safe_non_negative_number,
    to_int,
)

DEFAULT_GUESTS = 100
MIN_GUESTS = 1
DEFAULT_VENUE_CAPACITY = 999999
DEFAULT_COST_PER_GUEST = 40
FALLBACK_CATERING = {"planned_amount": 4000, "cost_per_guest": 45}
TASK_KEYWORDS = ("guest", "seating", "stationer", "cater", "tasting", "invitation")


def _as_list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def _is_catering(expense: Any) -> bool:
    return isinstance(expense, dict) and expense.get("category") == "catering"


def _catering_cost_delta(event: dict[str, Any], guest_delta: int, variance_pct: float) -> float:
    """Return the total cost delta from guest-count and catering-package changes."""
    catering = next(
        (e for e in _as_list(event.get("expenses")) if _is_catering(e)),
        FALLBACK_CATERING,
    )
    cost_per_guest = max(0.0, number_or(catering.get("cost_per_guest"), DEFAULT_COST_PER_GUEST))
    planned = safe_non_negative_number(catering.get("planned_amount"))
    pct_delta = round_half_up(planned * (variance_pct / PERCENT_SCALE))
    return guest_delta * cost_per_guest + pct_delta


def _affected_tasks(tasks: Any) -> list[dict[str, Any]]:
    """Timeline tasks whose title or category touches guest-count-sensitive work."""
    affected: list[dict[str, Any]] = []
    for t in _as_list(tasks):
        if not isinstance(t, dict):
            continue
        haystack = f"{str(t.get('title', '')).lower()}\n{str(t.get('category', '')).lower()}"
        if any(k in haystack for k in TASK_KEYWORDS):
            affected.append(
                {"id": t.get("id"), "title": t.get("title"), "due_date": t.get("due_date")}
            )
    return affected


def _capacity_line(guests: int, capacity: float, breach: bool, excess: int) -> str:
    limit = round_half_up(capacity)
    if breach:
        return (
            f"⚠️ CRITICAL: Projected {guests} guests exceeds venue capacity of {limit} by {excess}!"
        )
    return f"✓ Venue capacity comfortably holds {guests} guests (limit: {limit})."


def _budget_line(remaining: float, deficit: float) -> str:
    if remaining >= 0:
        return (
            f"Contingency buffer absorbs the change with ${format_amount(remaining)} "
            "breathing room remaining."
        )
    return f"⚠️ Budget overrun of ${format_amount(deficit)} projected! Reallocation needed."


def simulate_ripple(event: dict[str, Any], deltas: dict[str, Any] | None = None) -> dict[str, Any]:
    """Execute a multi-factor ripple deduction for an injected scenario."""
    if not isinstance(event, dict):
        raise ValueError("simulate_ripple requires an event dictionary.")

    deltas = deltas if isinstance(deltas, dict) else {}
    current = calculate_budget_summary(event)
    guest_delta = to_int(deltas.get("guest_delta"), 0)
    variance_pct = number_or(deltas.get("catering_variance_pct"), 0.0)

    # Like capacity, a recorded guest count of zero means "not set".
    current_guests = max(MIN_GUESTS, to_int(event.get("expected_guests"), 0) or DEFAULT_GUESTS)
    new_guests = max(MIN_GUESTS, current_guests + guest_delta)
    # A recorded capacity of zero means "not set": it never produces a breach.
    capacity = safe_non_negative_number(event.get("venue_capacity")) or DEFAULT_VENUE_CAPACITY
    capacity_breach = new_guests > capacity
    excess_guests = round_half_up(new_guests - capacity) if capacity_breach else 0

    cost_delta = _catering_cost_delta(event, guest_delta, variance_pct)
    projected_allocated = current["total_allocated"] + cost_delta
    projected_remaining = current["total_budget"] - projected_allocated
    projected_deficit = max(0.0, projected_allocated - current["total_budget"])

    sign = "+$" if cost_delta >= 0 else "-$"
    narrative = [
        f"Guest count shifts by {guest_delta:+d} (projected total: {new_guests}).",
        f"Catering package variance: {format_signed_tenths(variance_pct)}%.",
        f"Projected financial shift: {sign}{format_amount(abs(cost_delta))}.",
        _capacity_line(new_guests, capacity, capacity_breach, excess_guests),
        _budget_line(projected_remaining, projected_deficit),
    ]

    return {
        "initial": {
            "guests": current_guests,
            "allocated": current["total_allocated"],
            "remaining": current["remaining_uncommitted"],
        },
        "projected": {
            "guests": new_guests,
            "allocated": projected_allocated,
            "remaining": projected_remaining,
            "deficit": projected_deficit,
            "cost_delta": cost_delta,
            "capacity_breach": capacity_breach,
            "excess_guests": excess_guests,
        },
        "narrative": narrative,
        "affected_tasks": _affected_tasks(event.get("tasks", [])),
    }
