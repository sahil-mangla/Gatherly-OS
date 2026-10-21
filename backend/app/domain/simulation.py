"""MiroFish-Inspired Multi-Domain Celebration Simulation Engine.

Simulates cross-cutting ripple effects across Budget, Venue Capacity,
Timeline Pressure, and Vendor Requirements without mutating ground truth.
"""

from typing import Any

from .budget import calculate_budget_summary, safe_non_negative_number


def simulate_ripple(event: dict[str, Any], deltas: dict[str, Any] | None = None) -> dict[str, Any]:
    """Execute a multi-factor ripple deduction for an injected scenario."""
    if not isinstance(event, dict):
        raise ValueError("simulate_ripple requires an event dictionary.")

    deltas = deltas or {}
    current_summary = calculate_budget_summary(event)

    guest_delta = int(deltas.get("guest_delta", 0))
    catering_variance_pct = float(deltas.get("catering_variance_pct", 0.0))

    current_guests = max(1, int(event.get("expected_guests", 100)))
    new_guests = max(1, current_guests + guest_delta)
    venue_capacity = safe_non_negative_number(event.get("venue_capacity", 999999))

    capacity_breach = new_guests > venue_capacity
    excess_guests = int(new_guests - venue_capacity) if capacity_breach else 0

    # Find catering expense variable parameters
    expenses = event.get("expenses", [])
    catering_exp = next(
        (e for e in expenses if isinstance(e, dict) and e.get("category") == "catering"),
        {"planned_amount": 4000, "cost_per_guest": 45},
    )

    cost_per_guest = safe_non_negative_number(catering_exp.get("cost_per_guest", 40))
    variable_guest_cost_delta = guest_delta * cost_per_guest
    catering_planned = safe_non_negative_number(catering_exp.get("planned_amount", 0))
    catering_pct_cost_delta = round(catering_planned * (catering_variance_pct / 100.0))

    total_cost_delta = variable_guest_cost_delta + catering_pct_cost_delta
    projected_allocated = current_summary["total_allocated"] + total_cost_delta
    projected_remaining = current_summary["total_budget"] - projected_allocated
    projected_deficit = max(0.0, projected_allocated - current_summary["total_budget"])

    # Identify affected timeline milestones
    tasks = event.get("tasks", [])
    affected_tasks: list[dict[str, Any]] = []
    keywords = ("guest", "seating", "stationer", "cater", "tasting", "invitation")

    for t in tasks:
        if not isinstance(t, dict):
            continue
        title = str(t.get("title", "")).lower()
        cat = str(t.get("category", "")).lower()
        if any(k in title or k in cat for k in keywords):
            affected_tasks.append(
                {
                    "id": t.get("id"),
                    "title": t.get("title"),
                    "due_date": t.get("due_date"),
                }
            )

    narrative = [
        f"Guest count shifts by {guest_delta:+d} (projected total: {new_guests}).",
        f"Catering package variance: {catering_variance_pct:+.1f}%.",
        f"Projected financial shift: {'+$' if total_cost_delta >= 0 else '-$'}{abs(total_cost_delta):,.0f}.",
    ]

    if capacity_breach:
        narrative.append(
            f"⚠️ CRITICAL: Projected {new_guests} guests exceeds venue capacity of {venue_capacity:.0f} by {excess_guests}!"
        )
    else:
        narrative.append(
            f"✓ Venue capacity comfortably holds {new_guests} guests (limit: {venue_capacity:.0f})."
        )

    if projected_remaining >= 0:
        narrative.append(
            f"Contingency buffer absorbs the change with ${projected_remaining:,.0f} breathing room remaining."
        )
    else:
        narrative.append(
            f"⚠️ Budget overrun of ${projected_deficit:,.0f} projected! Reallocation needed."
        )

    return {
        "initial": {
            "guests": current_guests,
            "allocated": current_summary["total_allocated"],
            "remaining": current_summary["remaining_uncommitted"],
        },
        "projected": {
            "guests": new_guests,
            "allocated": projected_allocated,
            "remaining": projected_remaining,
            "deficit": projected_deficit,
            "cost_delta": total_cost_delta,
            "capacity_breach": capacity_breach,
            "excess_guests": excess_guests,
        },
        "narrative": narrative,
        "affected_tasks": affected_tasks,
    }
