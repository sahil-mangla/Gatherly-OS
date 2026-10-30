"""MiroFish-Inspired Multi-Domain Celebration Simulation Engine.

Simulates cross-cutting ripple effects across Budget, Venue Capacity,
Timeline Pressure, and Vendor Requirements without mutating ground truth.
"""

from typing import Any

from .budget import PERCENT_SCALE, calculate_budget_summary, safe_non_negative_number

DEFAULT_GUESTS = 100
MIN_GUESTS = 1
DEFAULT_VENUE_CAPACITY = 999999
DEFAULT_COST_PER_GUEST = 40
FALLBACK_CATERING = {"planned_amount": 4000, "cost_per_guest": 45}
TASK_KEYWORDS = ("guest", "seating", "stationer", "cater", "tasting", "invitation")


def _catering_cost_delta(event: dict[str, Any], guest_delta: int, variance_pct: float) -> float:
    """Return the total cost delta from guest-count and catering-package changes."""
    catering = next(
        (
            e
            for e in event.get("expenses", [])
            if isinstance(e, dict) and e.get("category") == "catering"
        ),
        FALLBACK_CATERING,
    )
    cost_per_guest = safe_non_negative_number(
        catering.get("cost_per_guest", DEFAULT_COST_PER_GUEST)
    )
    planned = safe_non_negative_number(catering.get("planned_amount", 0))
    pct_delta = round(planned * (variance_pct / PERCENT_SCALE))
    return guest_delta * cost_per_guest + pct_delta


def _affected_tasks(tasks: list[Any]) -> list[dict[str, Any]]:
    """Timeline tasks whose title or category touches guest-count-sensitive work."""
    affected: list[dict[str, Any]] = []
    for t in tasks:
        if not isinstance(t, dict):
            continue
        haystack = f"{str(t.get('title', '')).lower()}\n{str(t.get('category', '')).lower()}"
        if any(k in haystack for k in TASK_KEYWORDS):
            affected.append(
                {"id": t.get("id"), "title": t.get("title"), "due_date": t.get("due_date")}
            )
    return affected


def _capacity_line(guests: int, capacity: float, breach: bool, excess: int) -> str:
    if breach:
        return (
            f"⚠️ CRITICAL: Projected {guests} guests exceeds venue capacity "
            f"of {capacity:.0f} by {excess}!"
        )
    return f"✓ Venue capacity comfortably holds {guests} guests (limit: {capacity:.0f})."


def _budget_line(remaining: float, deficit: float) -> str:
    if remaining >= 0:
        return (
            f"Contingency buffer absorbs the change with ${remaining:,.0f} "
            "breathing room remaining."
        )
    return f"⚠️ Budget overrun of ${deficit:,.0f} projected! Reallocation needed."


def simulate_ripple(event: dict[str, Any], deltas: dict[str, Any] | None = None) -> dict[str, Any]:
    """Execute a multi-factor ripple deduction for an injected scenario."""
    if not isinstance(event, dict):
        raise ValueError("simulate_ripple requires an event dictionary.")

    deltas = deltas or {}
    current = calculate_budget_summary(event)
    guest_delta = int(deltas.get("guest_delta", 0))
    variance_pct = float(deltas.get("catering_variance_pct", 0.0))

    current_guests = max(MIN_GUESTS, int(event.get("expected_guests", DEFAULT_GUESTS)))
    new_guests = max(MIN_GUESTS, current_guests + guest_delta)
    capacity = safe_non_negative_number(event.get("venue_capacity", DEFAULT_VENUE_CAPACITY))
    capacity_breach = new_guests > capacity
    excess_guests = int(new_guests - capacity) if capacity_breach else 0

    cost_delta = _catering_cost_delta(event, guest_delta, variance_pct)
    projected_allocated = current["total_allocated"] + cost_delta
    projected_remaining = current["total_budget"] - projected_allocated
    projected_deficit = max(0.0, projected_allocated - current["total_budget"])

    sign = "+$" if cost_delta >= 0 else "-$"
    narrative = [
        f"Guest count shifts by {guest_delta:+d} (projected total: {new_guests}).",
        f"Catering package variance: {variance_pct:+.1f}%.",
        f"Projected financial shift: {sign}{abs(cost_delta):,.0f}.",
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
