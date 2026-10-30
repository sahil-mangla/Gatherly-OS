"""Validation of model output before it reaches the API response."""

import pytest

from app.services.mara_sanitize import (
    MAX_AMOUNT,
    clean_amount,
    clean_text,
    sanitize_model_output,
    sanitize_proposal,
    sanitize_proposals,
    sanitize_quote,
)


def proposal(**overrides):
    return {"id": "p1", "action": "custom", "title": "Do a thing", **overrides}


@pytest.mark.parametrize(
    "raw,expected",
    [
        (50, 50.0),
        (0, 0.0),
        (-5, 0.0),
        (2e12, MAX_AMOUNT),
        (MAX_AMOUNT, MAX_AMOUNT),
        (12.5, 12.5),
        (float("nan"), None),
        (float("inf"), None),
        (float("-inf"), None),
        (True, None),
        ("100", None),
        (None, None),
        ([1], None),
    ],
)
def test_clean_amount(raw, expected):
    assert clean_amount(raw) == expected


@pytest.mark.parametrize(
    "raw,limit,expected",
    [("  hi  ", 100, "hi"), ("x" * 50, 10, "x" * 10), (5, 10, None), (None, 10, None), ("", 5, "")],
)
def test_clean_text(raw, limit, expected):
    assert clean_text(raw, limit) == expected


def test_unknown_action_drops_the_proposal():
    assert sanitize_proposal(proposal(action="drop_database"), 0) is None
    assert sanitize_proposal({"title": "no action"}, 0) is None


@pytest.mark.parametrize("raw", [None, "text", 7, ["a"], proposal(title="  "), proposal(title=3)])
def test_non_dict_or_untitled_proposals_are_ignored(raw):
    assert sanitize_proposal(raw, 0) is None


def test_long_labels_are_truncated_to_100_chars():
    cleaned = sanitize_proposal(
        proposal(category="c" * 150, from_category="f" * 101, to_category="t" * 100, id="i" * 300),
        0,
    )
    assert cleaned["category"] == "c" * 100
    assert cleaned["from_category"] == "f" * 100
    assert cleaned["to_category"] == "t" * 100
    assert cleaned["id"] == "i" * 100


def test_title_and_description_have_their_own_limits():
    cleaned = sanitize_proposal(proposal(title="T" * 500, description="D" * 5000), 0)
    assert (len(cleaned["title"]), len(cleaned["description"])) == (200, 2000)


@pytest.mark.parametrize(
    "field,raw,expected",
    [
        ("amount", -10, 0.0),
        ("amount", 5e15, MAX_AMOUNT),
        ("savings", float("nan"), None),
        ("savings", float("inf"), None),
        ("amount", "12", None),
        ("savings", 99, 99.0),
    ],
)
def test_amount_fields_are_clamped_or_rejected(field, raw, expected):
    assert sanitize_proposal(proposal(**{field: raw}), 0)[field] == expected


def test_missing_id_and_description_get_defaults():
    cleaned = sanitize_proposal({"action": "add_task", "title": "T"}, 4)
    assert cleaned["id"] == "prop-4"
    assert cleaned["description"] == ""
    assert cleaned["amount"] is None and cleaned["consequence"] is None


def test_proposal_list_is_capped_and_filters_invalid_entries():
    raw = [proposal(id=f"p{i}") for i in range(30)]
    assert len(sanitize_proposals(raw)) == 20
    mixed = [None, proposal(), "x", proposal(action="nope"), proposal(id="p2")]
    assert [p["id"] for p in sanitize_proposals(mixed)] == ["p1", "p2"]


@pytest.mark.parametrize("raw", [None, "x", {"a": 1}, 3])
def test_non_list_proposals_become_empty(raw):
    assert sanitize_proposals(raw) == []


def test_quote_keeps_scalars_only_and_bounds_sizes():
    quote = sanitize_quote(
        {"ok": 1, "text": "y" * 900, "flag": True, "nothing": None, "nested": {"a": 1}, "l": [1]}
    )
    assert quote == {"ok": 1, "text": "y" * 500, "flag": True, "nothing": None}


def test_quote_key_count_and_key_length_are_capped():
    quote = sanitize_quote({f"k{i}": i for i in range(50)})
    assert len(quote) == 30
    assert list(sanitize_quote({"k" * 300: 1})) == ["k" * 100]


@pytest.mark.parametrize("raw", [None, "q", [1], 5])
def test_non_dict_quote_is_ignored(raw):
    assert sanitize_quote(raw) is None


@pytest.mark.parametrize("parsed", [None, [], "text", 12, {}, {"unknown": "field"}, {"summary": 5}])
def test_unusable_model_output_yields_none(parsed):
    assert sanitize_model_output(parsed) is None


def test_model_output_keeps_only_contract_fields():
    out = sanitize_model_output(
        {
            "summary": "  S  ",
            "response": "R" * 3000,
            "evil": "<script>",
            "proposals": [proposal()],
            "extracted_quote": {"vendor": "V"},
        }
    )
    assert out["success"] is True
    assert out["summary"] == "S" and len(out["response"]) == 2000
    assert "evil" not in out
    assert out["proposals"][0]["title"] == "Do a thing"
    assert out["extracted_quote"] == {"vendor": "V"}
