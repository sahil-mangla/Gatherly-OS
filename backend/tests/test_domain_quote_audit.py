"""The completeness audit reads the terms a vendor's saved (extracted) quotes state."""

import pytest

from app.domain.vendors import (
    audit_quote_completeness,
    extract_quote_from_raw_text,
    normalize_quote,
)

FULL_TEXT = (
    "Package $3,000. 18% gratuity, overtime $150 per hour, cleanup fee $200, "
    "deposit 25% non-refundable."
)


def saved_vendor(text):
    found = extract_quote_from_raw_text(text)
    stored = {"missing_disclosures": found["missing_fields"], "hidden_fees": found["hidden_fees"]}
    return {"id": "v1", "name": "Saved", "status": "shortlist", "quotes": [stored]}


def test_audit_reads_terms_a_saved_quote_states():
    assert audit_quote_completeness(saved_vendor(FULL_TEXT)) == (True, [])


def test_audit_still_flags_terms_a_saved_quote_never_mentions():
    complete, missing = audit_quote_completeness(saved_vendor("Package $3,000. Includes a DJ."))
    assert complete is False and len(missing) == 4


def test_audit_counts_fee_types_even_without_missing_disclosures():
    fees = [{"type": "overtime"}, {"type": "gratuity"}, {"type": "x"}]
    _, missing = audit_quote_completeness({"quotes": [{"hidden_fees": fees}]})
    assert missing == [
        "Post-event cleanup and teardown fees",
        "Cancellation milestones & deposit refund clause",
    ]


@pytest.mark.parametrize("quotes", [None, "x", [None, 5, {}], [{"missing_disclosures": "bad"}]])
def test_audit_ignores_malformed_saved_quotes(quotes):
    assert audit_quote_completeness({"quotes": quotes})[0] is False


def test_normalized_quote_carries_extracted_fees():
    fees = [{"type": "overtime", "label": "Overtime rate", "unit": "per_hour", "amount": 150}]
    assert normalize_quote({"hidden_fees": [*fees, "junk"]})["hidden_fees"] == fees
    assert normalize_quote({"hidden_fees": "x"})["hidden_fees"] == []
    assert normalize_quote({})["hidden_fees"] == []
