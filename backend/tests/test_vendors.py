"""Tests for vendor quote normalization, omission audits, and raw seed parsing."""

import time

import pytest

from app.domain.quote_percent import classify_percents
from app.domain.vendors import (
    audit_quote_completeness,
    compare_quotes,
    extract_quote_from_raw_text,
    generate_follow_up_questions,
    normalize_quote,
)


def test_quote_completeness_and_omission_audit():
    incomplete = {
        "name": "Sol Studio",
        "inclusions": ["8 hours coverage"],
        "notes": "",
    }
    is_complete, missing = audit_quote_completeness(incomplete)
    assert is_complete is False
    assert any("cleanup" in m for m in missing)
    assert any("staff" in m for m in missing)
    assert any("Overtime" in m for m in missing)
    assert any("Cancellation" in m for m in missing)


def test_quote_normalization_and_comparison():
    q1 = {"name": "Vendor A", "price": 2000, "deposit": 500, "inclusions": ["Basic"]}
    q2 = {
        "name": "Vendor B",
        "price": 2500,
        "deposit": 1000,
        "inclusions": ["Full", "Service staff included", "Post-event cleanup"],
        "notes": "Overtime rate $150. Cancellation policy available.",
    }

    norm = normalize_quote(q1)
    assert norm["base_price"] == 2000.0
    assert norm["deposit_percent"] == 25

    comparison = compare_quotes([q1, q2])
    assert comparison["count"] == 2
    assert comparison["cheapest_price"] == 2000.0
    assert "Vendor A" in comparison["comparison_summary"]


def test_raw_seed_quote_extraction():
    raw_email = (
        "Hello! Our studio package is $2,800 with a $840 deposit. "
        "Includes 8 hours of photography and an online gallery."
    )
    extracted = extract_quote_from_raw_text(raw_email)
    assert extracted["quoted_base_amount"] == 2800.0
    assert extracted["deposit_amount"] == 840.0
    assert len(extracted["missing_fields"]) > 0
    assert len(extracted["follow_up_questions"]) >= 3


def test_generate_follow_up_questions():
    incomplete = {"inclusions": ["Basic music setup"]}
    questions = generate_follow_up_questions(incomplete)
    assert len(questions) >= 3
    assert any("cleanup" in q for q in questions)
    assert any("staff" in q for q in questions)


ADVERSARIAL = {
    "digit run": "1" * 20000,
    "deposit digit run": "deposit " + "1" * 20000,
    "tip digit run": "tip " + "1" * 20000,
    "dollar digit run": "$" + "1" * 20000,
    "dotted digits": "1." * 10000,
    "percent signs": "%" * 20000,
    "spaced digits": "1 " * 10000,
    "dollar commas": "$1," * 7000,
    "digits then guests": "1" * 20000 + " guests",
    "deposit whitespace": "deposit" + " " * 20000 + "x",
    "repeated tip percents": "tip 5% " * 5000,
}
MAX_SECONDS = 0.5


@pytest.mark.parametrize("text", ADVERSARIAL.values(), ids=ADVERSARIAL.keys())
def test_adversarial_input_extracts_in_linear_time(text):
    started = time.perf_counter()
    result = extract_quote_from_raw_text(text)
    assert time.perf_counter() - started < MAX_SECONDS
    assert result["quoted_base_amount"] >= 0


BASE = "Package $4,950. "


@pytest.mark.parametrize(
    "text,deposit,fees",
    [
        ("20% gratuity and 8% service charge", None, [("gratuity", 20.0), ("service charge", 8.0)]),
        ("Gratuity 20%", None, [("Gratuity", 20.0)]),
        ("5% admin fee. 25% deposit.", 25.0, [("admin fee", 5.0)]),
        (
            "22% service charge applies. 50% deposit holds the date.",
            50.0,
            [("service charge", 22.0)],
        ),
        ("Service fee of 10% and 12% tip", None, [("Service fee", 10.0), ("tip", 12.0)]),
        ("Tip: 15%; deposit of 30%", 30.0, [("Tip", 15.0)]),
        ("Gratuity is optional. 25% deposit.", 25.0, []),
        ("Gratuity.\n20% off for locals", None, []),
        ("Gratuity far far away from the figure 20%", None, []),
        ("Save 10% when booking", None, []),
        ("40% non-refundable retainer", 40.0, []),
    ],
)
def test_percent_classification_rules(text, deposit, fees):
    got_deposit, got_fees = classify_percents(BASE + text)
    assert got_deposit == deposit
    assert [(f.word, f.rate) for f in got_fees] == fees


def test_percent_fees_priced_against_the_base_once_each():
    res = extract_quote_from_raw_text(BASE + "20% gratuity and 8% service charge")
    fees = {f["type"]: (f["rate"], f["amount"]) for f in res["hidden_fees"]}
    assert fees == {"gratuity": (20.0, 990.0), "service_charge": (8.0, 396.0)}
    assert len(res["hidden_fees"]) == 2


def test_deposit_percentage_is_never_also_a_fee():
    res = extract_quote_from_raw_text(BASE + "5% admin fee. 25% deposit.")
    assert [(f["type"], f["rate"]) for f in res["hidden_fees"]] == [("service_charge", 5.0)]
    assert res["deposit_amount"] == 1237.5 and res["deposit_stated"] is True


@pytest.mark.parametrize(
    "text",
    ["Per plate $65, 150 guests", "Per person: $65 for 150 guests", "$65 per plate, 150 guests"],
)
def test_per_person_rate_is_multiplied_by_guest_count(text):
    res = extract_quote_from_raw_text(text)
    assert res["quoted_base_amount"] == 9750.0
    assert res["flags"] == ["amount_estimated"]


def test_per_person_unit_before_total_does_not_demote_the_total():
    res = extract_quote_from_raw_text("$48 per person: $7,200 for 150 guests")
    assert res["quoted_base_amount"] == 7200.0
    assert res["flags"] == []
