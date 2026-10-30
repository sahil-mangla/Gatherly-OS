"""Offline Mara only proposes a reallocation when a category is actually over its plan."""

from app.services.mara_fallback import generate_deterministic_mara_response as respond


def actions(budget):
    return [p["action"] for p in respond("cost_saving_proposals", {"budget": budget})["proposals"]]


def test_new_event_with_nothing_spent_gets_no_reallocation():
    budget = {
        "categories": {
            "catering": {"planned": 6000, "allocated": 0},
            "venue": {"planned": 4000, "allocated": 0},
        }
    }
    result = respond("cost_saving_proposals", {"budget": budget})
    assert [p["action"] for p in result["proposals"]] == ["custom"]
    assert result["summary"].startswith("Identified 1 balanced adjustment based on")


def test_reallocation_needs_a_category_actually_over_plan():
    on_plan = {
        "categories": {
            "a": {"planned": 500, "allocated": 500},
            "b": {"planned": 900, "allocated": 100},
        }
    }
    assert "reallocate" not in actions(on_plan)


def test_reallocation_still_offered_when_a_category_is_over_plan():
    over = {
        "categories": {
            "a": {"planned": 500, "allocated": 800},
            "b": {"planned": 900, "allocated": 100},
        }
    }
    assert actions(over)[0] == "reallocate"
