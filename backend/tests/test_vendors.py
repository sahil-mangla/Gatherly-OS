"""Tests for vendor quote normalization, omission audits, and raw seed parsing."""

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
