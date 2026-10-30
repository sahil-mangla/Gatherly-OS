"""Deterministic Mara responses: every operation, built from the caller's real categories."""

import pytest

from app.services.mara_fallback import generate_deterministic_mara_response as respond

BUDGET = {
    "total_budget": 24000,
    "remaining_uncommitted": 5540,
    "categories": {
        "lighting_rental": {"planned": 1000, "allocated": 2000},
        "stationery_print": {"planned": 3000, "allocated": 500},
    },
}


def by_action(result, action):
    return next(p for p in result["proposals"] if p["action"] == action)


def test_every_response_is_flagged_successful_and_deterministic():
    for op in ("cost_saving_proposals", "prioritize_tasks", "risk_explanation", "whatever"):
        result = respond(op, {})
        assert result["success"] is True and result["provider"] == "deterministic_mock"


def test_cost_saving_uses_real_categories_not_hardcoded_ones():
    result = respond("cost_saving_proposals", {"budget": BUDGET})
    realloc = by_action(result, "reallocate")
    assert (realloc["from_category"], realloc["to_category"]) == (
        "stationery_print",
        "lighting_rental",
    )
    assert realloc["amount"] == 1200.0  # half of 2500 headroom, capped at MAX_REALLOCATION
    assert "Stationery Print" in realloc["title"] and "Lighting Rental" in realloc["title"]
    trim = by_action(result, "update_expense")
    assert (trim["category"], trim["savings"]) == ("lighting_rental", 100.0)
    assert by_action(result, "custom")["id"] == "prop-fixed-fee-caps"
    assert result["summary"].startswith("Identified 3 balanced adjustments")
    assert "2 budget categories" in result["summary"]


def test_small_headroom_is_halved_and_rounded():
    budget = {
        "categories": {
            "a": {"planned": 100, "allocated": 300},
            "b": {"planned": 500, "allocated": 100},
        }
    }
    assert (
        by_action(respond("cost_saving_proposals", {"budget": budget}), "reallocate")["amount"]
        == 200.0
    )


@pytest.mark.parametrize(
    "budget",
    [
        {"categories": {"only": {"planned": 100, "allocated": 900}}},
        {
            "categories": {
                "a": {"planned": 100, "allocated": 100},
                "b": {"planned": 50, "allocated": 50},
            }
        },
        {
            "categories": {
                "a": {"planned": 100, "allocated": 300},
                "b": {"planned": 100, "allocated": 100},
            }
        },
    ],
)
def test_no_reallocation_without_a_donor_with_headroom(budget):
    result = respond("cost_saving_proposals", {"budget": budget})
    assert [p["action"] for p in result["proposals"]][0] != "reallocate"


@pytest.mark.parametrize(
    "context", [{}, {"budget": None}, {"budget": "x"}, {"budget": {"categories": []}}]
)
def test_cost_saving_without_categories_still_returns_custom_proposal(context):
    result = respond("cost_saving_proposals", context)
    assert [p["action"] for p in result["proposals"]] == ["custom"]
    assert "0 budget categories" in result["summary"]


def test_category_rows_ignore_malformed_entries_and_cap_name_length():
    budget = {
        "categories": {
            "ok": {"planned": "bad", "allocated": True},
            "n" * 150: {"allocated": 10},
            5: {},
            "x": 3,
        }
    }
    result = respond("cost_saving_proposals", {"budget": budget})
    trim = by_action(result, "update_expense")
    assert (trim["category"], trim["savings"]) == ("n" * 100, 0.0)
    assert [p["action"] for p in result["proposals"]] == ["update_expense", "custom"]


def test_trim_skipped_when_nothing_is_allocated():
    budget = {"categories": {"a": {"planned": 10, "allocated": 0}}}
    assert [
        p["action"] for p in respond("cost_saving_proposals", {"budget": budget})["proposals"]
    ] == ["custom"]


def test_prioritize_tasks_names_the_two_earliest_open_tasks():
    tasks = [
        {"title": "Late", "due_date": "2026-09-01"},
        {"title": "Done", "due_date": "2026-01-01", "status": "done"},
        {"title": "Early", "due_date": "2026-03-01"},
        {"title": "Middle", "due_date": "2026-05-01"},
        "junk",
    ]
    result = respond("prioritize_tasks", {"tasks": tasks})
    assert result["headline"] == "Focus on 2 critical path items"
    assert result["advice"] == "Prioritize sign-off on: Early; Middle."


def test_prioritize_tasks_singular_and_truncated_title():
    result = respond("prioritize_tasks", {"tasks": [{"title": "T" * 300}]})
    assert result["headline"] == "Focus on 1 critical path item"
    assert result["advice"] == f"Prioritize sign-off on: {'T' * 100}."


@pytest.mark.parametrize(
    "tasks", [None, [], "x", [{"title": "x", "status": "done"}], [{"due_date": "2026-01-01"}]]
)
def test_prioritize_tasks_default_when_nothing_open(tasks):
    result = respond("prioritize_tasks", {"tasks": tasks})
    assert result["headline"] == "Review your critical path this week"


def test_risk_explanation_quotes_top_risk_evidence():
    result = respond("risk_explanation", {"risks": [{"evidence": "Catering is 20% over."}, {}]})
    assert result["cause"] == "Catering is 20% over."
    assert result["consequence"].startswith("Could exhaust your contingency")
    assert result["suggested_action"].startswith("Lock in remaining quotes")


@pytest.mark.parametrize("risks", [None, [], "x", ["str"], [{"evidence": 5}], [{"evidence": ""}]])
def test_risk_explanation_default_cause(risks):
    cause = respond("risk_explanation", {"risks": risks})["cause"]
    assert cause == "Committed expenses are tracking faster than scheduled milestones."


def test_risk_evidence_is_truncated():
    assert len(respond("risk_explanation", {"risks": [{"evidence": "e" * 900}]})["cause"]) == 500


def test_parse_quote_seed_extracts_from_prompt():
    result = respond("parse_quote_seed", {}, "Photography package $2,500 with $750 deposit.")
    assert result["extracted_quote"]["quoted_base_amount"] == 2500.0
    assert result["extracted_quote"]["deposit_amount"] == 750.0


@pytest.mark.parametrize("op", ["general_advice", "unknown_op", ""])
def test_unknown_operations_use_general_advice(op):
    result = respond(op, {"event": {"name": "Gala"}, "budget": BUDGET})
    assert result["response"] == (
        "Mara analyzed the current state for 'Gala'. Total budget is $24,000 "
        "with $5,540 breathing room remaining."
    )


def test_general_advice_defaults_and_truncates_name():
    assert respond("x", {})["response"] == "Mara analyzed the current state for 'your celebration'."
    assert "N" * 100 + "'" in respond("x", {"event": {"name": "N" * 300}})["response"]


@pytest.mark.parametrize("context", [None, [], "text", 7, [1, 2]])
def test_non_dict_context_never_crashes(context):
    for op in ("cost_saving_proposals", "prioritize_tasks", "risk_explanation", "general_advice"):
        assert respond(op, context)["success"] is True


def test_general_advice_ignores_boolean_budget_values():
    budget = {"total_budget": True, "remaining_uncommitted": False}
    assert "Total budget" not in respond("general_advice", {"budget": budget})["response"]
