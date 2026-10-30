"""Raw-email quote extraction: vendor name, amounts, deposits and hidden fees."""

import pytest

from app.domain.quote_money import parse_money_items, pick_base_amount
from app.domain.quote_parser import (
    detect_service_type,
    extract_inclusions,
    extract_vendor_name,
)
from app.domain.vendors import (
    compare_quotes,
    extract_quote_from_raw_text,
    generate_follow_up_questions,
    normalize_quote,
)

CATERER_EMAIL = (
    "Sunrise Catering here. Plated dinner for 150 guests at $48 per person = $7,200. "
    "Gratuity 20% and a service charge of 18% apply. Overtime is $250/hr after 11pm. "
    "Cleanup $300. Deposit of $2,000 to hold the date."
)
FLORIST_EMAIL = (
    "Hi there,\n\nBloom & Vine Florals — quote for your June wedding. "
    "Includes bridal bouquet, 12 centerpieces and a ceremony arch. "
    "Total $3,450 (subtotal $3,000 plus delivery $150 and setup fee $300). "
    "50% deposit due at signing."
)
PHOTO_EMAIL = (
    "Hello! This is Maria from Golden Hour Photography. We offer 8 hours of coverage "
    "for $2,800 with a $840 deposit. Extra hours are $200 per hour. "
    "Does not include travel outside the city."
)


def _fee(result, kind):
    return next(f for f in result["hidden_fees"] if f["type"] == kind)


@pytest.fixture
def caterer():
    return extract_quote_from_raw_text(CATERER_EMAIL)


def test_caterer_email_core_fields(caterer):
    assert caterer["vendor_name"] == "Sunrise Catering"
    assert caterer["service_type"] == "catering"
    assert caterer["quoted_base_amount"] == 7200.0  # explicit '=' total, not 150 guests or $48
    assert caterer["deposit_amount"] == 2000.0
    assert caterer["deposit_stated"] is True
    assert caterer["flags"] == []


@pytest.mark.parametrize(
    "kind,field,expected",
    [
        ("gratuity", "rate", 20.0),
        ("gratuity", "amount", 1440.0),
        ("service_charge", "rate", 18.0),
        ("overtime", "unit", "per_hour"),
        ("overtime", "amount", 250.0),
        ("cleanup", "amount", 300.0),
    ],
)
def test_caterer_email_hidden_fees(caterer, kind, field, expected):
    assert _fee(caterer, kind)[field] == expected


def test_florist_email_prefers_total_and_derives_percent_deposit():
    res = extract_quote_from_raw_text(FLORIST_EMAIL)
    assert res["vendor_name"] == "Bloom & Vine Florals"
    assert res["service_type"] == "florals"
    assert res["quoted_base_amount"] == 3450.0  # 'Total' beats larger-looking sub-figures
    assert res["deposit_amount"] == 1725.0  # 50% of the base, because the text says so
    assert res["inclusions"] == ["Bridal bouquet", "12 centerpieces", "A ceremony arch"]
    fee_types = {f["type"] for f in res["hidden_fees"]}
    assert {"fee", "cleanup"} <= fee_types


def test_photographer_email_with_from_phrase_and_exclusion():
    res = extract_quote_from_raw_text(PHOTO_EMAIL)
    assert res["vendor_name"] == "Golden Hour Photography"
    assert res["service_type"] == "photography"
    assert res["quoted_base_amount"] == 2800.0
    assert res["deposit_amount"] == 840.0
    assert _fee(res, "overtime")["rate"] == 200.0
    assert res["inclusions"] == []  # 'does not include' is not an inclusion


def test_no_amount_is_flagged_not_invented():
    res = extract_quote_from_raw_text("Thanks for reaching out, we would love to cater your event.")
    assert res["quoted_base_amount"] == 0.0
    assert res["deposit_amount"] == 0.0
    assert res["deposit_stated"] is False
    assert "no_amount_found" in res["flags"]
    assert any("No dollar amount" in n for n in res["notes"])
    assert res["confidence_score"] <= 0.5
    assert len(res["follow_up_questions"]) >= 3


def test_deposit_never_fabricated():
    res = extract_quote_from_raw_text("Photography package $2,500. 8 hours coverage.")
    assert res["quoted_base_amount"] == 2500.0
    assert res["deposit_amount"] == 0.0
    assert res["deposit_stated"] is False


def test_bare_guest_count_is_never_an_amount():
    res = extract_quote_from_raw_text("We can host 150 guests. Reach out for pricing.")
    assert res["quoted_base_amount"] == 0.0


def test_only_per_person_rate_is_multiplied_by_guests():
    res = extract_quote_from_raw_text("DJ Nova here: $65 per person for 120 guests.")
    assert res["vendor_name"] == "DJ Nova"
    assert res["service_type"] == "music"
    assert res["quoted_base_amount"] == 7800.0
    assert "amount_estimated" in res["flags"]


def test_largest_plain_amount_wins_when_nothing_is_explicit():
    items = parse_money_items("We could do $900 or $1,400 depending on hours.")
    assert pick_base_amount("", items) == (1400.0, None)


def test_decimals_and_thousands_separators():
    res = extract_quote_from_raw_text("Total: $12,345.67 all in.")
    assert res["quoted_base_amount"] == pytest.approx(12345.67)


def test_percent_fee_before_and_after_wording():
    res = extract_quote_from_raw_text("Total $1,000. 15% gratuity added. Service fee 10%.")
    kinds = {f["type"]: f["amount"] for f in res["hidden_fees"]}
    assert kinds == {"gratuity": 150.0, "service_charge": 100.0}


@pytest.mark.parametrize(
    "text,expected",
    [
        ("Sunrise Catering here. Hello.", "Sunrise Catering"),
        ("Bloom & Vine Florals — quote attached", "Bloom & Vine Florals"),
        ("Hello Sunrise Catering team, price below", "Sunrise Catering"),
        ("Our Sunrise Catering would love to help", "Sunrise Catering"),
        ("Catering here. $500", None),
        ("Hello! Our studio package is $2,800", None),
        ("Just some words", None),
    ],
)
def test_vendor_name_patterns(text, expected):
    assert extract_vendor_name(text) == expected


def test_service_type_prefers_vendor_name_then_text_then_default():
    assert detect_service_type("Golden Photography", "menu tasting") == "photography"
    assert detect_service_type(None, "lovely buffet") == "catering"
    assert detect_service_type(None, "table linens") == "decor"


def test_inclusions_are_capped_and_filtered():
    text = "Includes " + ", ".join(f"item{i}" for i in range(20)) + "."
    assert len(extract_inclusions(text)) == 8
    assert extract_inclusions("Includes " + "x" * 200 + ".") == []


def test_existing_return_shape_is_preserved():
    res = extract_quote_from_raw_text(CATERER_EMAIL)
    for key in (
        "vendor_name",
        "service_type",
        "quoted_base_amount",
        "deposit_amount",
        "inclusions",
        "exclusions",
        "missing_fields",
        "confidence_score",
        "follow_up_questions",
    ):
        assert key in res
    assert res["exclusions"] == res["missing_fields"]
    assert "$7,200 quote" in res["follow_up_questions"][0]


def test_normalize_defaults_and_alternate_keys():
    norm = normalize_quote({"quote_id": "q9", "tier_name": "Gold", "service_type": "dj"})
    assert (norm["id"], norm["name"], norm["category"]) == ("q9", "Gold", "dj")
    assert norm["base_price"] == 0.0 and norm["deposit_percent"] == 0
    empty = normalize_quote({})
    assert (empty["id"], empty["name"], empty["category"]) == ("quote-1", "Vendor Quote", "General")
    assert empty["estimated_hidden_risk_score"] == 4 * 15


def test_compare_quotes_empty_and_follow_up_fallback():
    assert compare_quotes([])["count"] == 0
    complete = {"inclusions": ["staff cleanup overtime refund"]}
    assert len(generate_follow_up_questions(complete)) == 2
