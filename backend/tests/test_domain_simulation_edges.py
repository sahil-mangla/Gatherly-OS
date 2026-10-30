"""Extreme-input tests for the ripple simulation."""

import pytest

from app.domain.simulation import simulate_ripple


def _event(**over):
    base = {
        "total_budget": 10000.0,
        "expected_guests": 100,
        "venue_capacity": 120,
        "expenses": [
            {
                "category": "catering",
                "planned_amount": 4000.0,
                "actual_amount": 1000.0,
                "committed_amount": 2000.0,
                "cost_per_guest": 30.0,
            }
        ],
        "tasks": [],
    }
    base.update(over)
    return base


def test_rejects_non_dict_event():
    with pytest.raises(ValueError):
        simulate_ripple("nope")


def test_no_deltas_is_identity():
    res = simulate_ripple(_event())
    assert res["projected"]["guests"] == 100
    assert res["projected"]["cost_delta"] == 0
    assert res["projected"]["allocated"] == res["initial"]["allocated"] == 3000.0


def test_guest_delta_floors_at_one_guest():
    res = simulate_ripple(_event(), {"guest_delta": -10000})
    assert res["projected"]["guests"] == 1
    assert res["projected"]["capacity_breach"] is False
    assert res["projected"]["cost_delta"] == -10000 * 30.0
    assert res["projected"]["allocated"] < 0  # savings exceed spend; math stays authoritative


def test_huge_guest_delta_breaches_capacity_and_budget():
    res = simulate_ripple(_event(), {"guest_delta": 10**6})
    assert res["projected"]["capacity_breach"] is True
    assert res["projected"]["excess_guests"] == 10**6 + 100 - 120
    assert res["projected"]["deficit"] > 0
    assert any("Budget overrun" in n for n in res["narrative"])
    assert any("CRITICAL" in n for n in res["narrative"])


def test_zero_capacity_means_not_set_and_never_breaches():
    res = simulate_ripple(_event(venue_capacity=0), {"guest_delta": 500})
    assert res["projected"]["capacity_breach"] is False
    assert res["projected"]["excess_guests"] == 0


@pytest.mark.parametrize(
    "delta,breach,excess",
    [(19, False, 0), (20, False, 0), (21, True, 1), (22, True, 2)],
)
def test_capacity_boundary_is_exclusive(delta, breach, excess):
    """Mutation guard for `>` vs `>=`: guests == capacity must hold, one more must breach."""
    res = simulate_ripple(_event(), {"guest_delta": delta})
    assert res["projected"]["guests"] == 100 + delta
    assert res["projected"]["capacity_breach"] is breach
    assert res["projected"]["excess_guests"] == excess


def test_guests_exactly_at_capacity_use_the_comfortably_holds_message():
    res = simulate_ripple(_event(), {"guest_delta": 20})
    assert res["narrative"][3] == "✓ Venue capacity comfortably holds 120 guests (limit: 120)."
    assert not any("CRITICAL" in line for line in res["narrative"])


def test_one_guest_over_capacity_uses_the_critical_message():
    res = simulate_ripple(_event(), {"guest_delta": 21})
    assert res["narrative"][3] == (
        "⚠️ CRITICAL: Projected 121 guests exceeds venue capacity of 120 by 1!"
    )


def test_zero_expected_guests_means_not_set_and_uses_default():
    assert simulate_ripple(_event(expected_guests=0))["initial"]["guests"] == 100
    assert simulate_ripple(_event(expected_guests=None))["initial"]["guests"] == 100
    assert simulate_ripple(_event(expected_guests=-4))["initial"]["guests"] == 1


@pytest.mark.parametrize(
    "pct,delta", [(-100.0, -4000), (1000.0, 40000), (10.0, 400), (-12.5, -500)]
)
def test_catering_variance_extremes(pct, delta):
    res = simulate_ripple(_event(), {"catering_variance_pct": pct})
    assert res["projected"]["cost_delta"] == delta


def test_negative_cost_delta_formatting_and_buffer_narrative():
    res = simulate_ripple(_event(), {"catering_variance_pct": -100.0})
    assert any("-$4,000" in n for n in res["narrative"])
    assert any("breathing room" in n for n in res["narrative"])


def test_missing_catering_expense_uses_documented_fallback():
    res = simulate_ripple(_event(expenses=[]), {"guest_delta": 10, "catering_variance_pct": 10})
    assert res["projected"]["cost_delta"] == 10 * 45 + 400


def test_affected_tasks_match_title_or_category_and_skip_junk():
    tasks = [
        {"id": "1", "title": "Order stationery", "due_date": "2025-01-01"},
        {"id": "2", "title": "Book band", "category": "Catering"},
        {"id": "3", "title": "Pay deposit"},
        "junk",
    ]
    res = simulate_ripple(_event(tasks=tasks))
    assert [t["id"] for t in res["affected_tasks"]] == ["1", "2"]
