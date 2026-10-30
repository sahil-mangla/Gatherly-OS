"""Vendor quote normalization, fee completeness audit, and raw seed parsing."""

from typing import Any

from .budget import safe_non_negative_number
from .quote_parser import extract_quote_from_raw_text

ESSENTIAL_QUOTE_FIELDS = [
    ("setup_cleanup", "Setup & post-event cleanup"),
    ("service_staff", "Service staff & gratuity policy"),
    ("overtime_rate", "Overtime hourly rate"),
    ("cancellation_terms", "Cancellation refund policy"),
]
HIDDEN_RISK_PER_MISSING = 15
DEFAULT_QUOTE_ID = "quote-1"
DEFAULT_QUOTE_NAME = "Vendor Quote"
DEFAULT_QUOTE_CATEGORY = "General"

# (keywords that satisfy the check, label reported when none are present)
AUDIT_CHECKS = (
    (("clean", "teardown", "breakdown"), "Post-event cleanup and teardown fees"),
    (("staff", "server", "labor", "crew"), "Service staff staffing & gratuity terms"),
    (("overtime", "extra hour", "curfew"), "Overtime hourly rate and curfew policy"),
    (
        ("refund", "cancellation", "deposit milestone"),
        "Cancellation milestones & deposit refund clause",
    ),
)


# Extractor labels (as a prefix of a stored quote's missing_disclosures) -> audit keywords that the
# quote states the term when the label is absent
STATED_TERM_NOTES = (
    ("Service staff", "staff and gratuity policy stated"),
    ("Post-event cleanup", "cleanup and teardown covered"),
    ("Overtime", "overtime rate stated"),
    ("Deposit milestones", "refund and cancellation terms stated"),
)
# Extracted fee types -> audit keywords for the term the fee itself states
FEE_TYPE_NOTES = {
    "gratuity": "staff and gratuity policy stated",
    "service_charge": "staff and gratuity policy stated",
    "overtime": "overtime rate stated",
    "cleanup": "cleanup and teardown covered",
}


def stated_terms_note(stored: dict[str, Any]) -> str:
    """Audit keywords for every essential term one extracted quote states (by text or by fee)."""
    notes: list[str] = []
    missing = stored.get("missing_disclosures")
    if isinstance(missing, list):
        notes += [
            note
            for label, note in STATED_TERM_NOTES
            if not any(str(m).startswith(label) for m in missing)
        ]
    fees = stored.get("hidden_fees")
    if isinstance(fees, list):
        notes += [
            FEE_TYPE_NOTES[fee["type"]]
            for fee in fees
            if isinstance(fee, dict) and fee.get("type") in FEE_TYPE_NOTES
        ]
    return "; ".join(notes)


def _stored_quotes_text(quote: dict[str, Any]) -> str:
    stored = quote.get("quotes")
    if not isinstance(stored, list):
        return ""
    return " ".join(stated_terms_note(q) for q in stored if isinstance(q, dict)).lower()


def audit_quote_completeness(quote: dict[str, Any]) -> tuple[bool, list[str]]:
    """Audit quote text, inclusions and saved extracted quotes to identify undisclosed fees."""
    inclusions = " ".join(quote.get("inclusions", [])).lower()
    notes = str(quote.get("notes", "")).lower()
    summary = str(quote.get("summary", "")).lower()
    missing_fields = " ".join(quote.get("missing_fields", [])).lower()
    combined = f"{inclusions} {notes} {summary} {missing_fields} {_stored_quotes_text(quote)}"

    missing = [
        label for keywords, label in AUDIT_CHECKS if not any(k in combined for k in keywords)
    ]
    return len(missing) == 0, missing


def _first_truthy(raw: dict[str, Any], keys: tuple[str, ...], default: Any) -> Any:
    """First truthy value among ``keys`` in ``raw``, else ``default``."""
    return next((raw[k] for k in keys if raw.get(k)), default)


def _fee_list(value: Any) -> list[dict[str, Any]]:
    return [fee for fee in value if isinstance(fee, dict)] if isinstance(value, list) else []


def normalize_quote(raw_quote: dict[str, Any]) -> dict[str, Any]:
    """Normalize vendor quote structure for side-by-side comparison."""
    base_price = safe_non_negative_number(_first_truthy(raw_quote, ("price", "quoted_amount"), 0.0))
    deposit = safe_non_negative_number(_first_truthy(raw_quote, ("deposit", "deposit_paid"), 0.0))
    is_complete, missing = audit_quote_completeness(raw_quote)

    return {
        "id": _first_truthy(raw_quote, ("id", "quote_id"), DEFAULT_QUOTE_ID),
        "name": _first_truthy(raw_quote, ("name", "tier_name"), DEFAULT_QUOTE_NAME),
        "category": _first_truthy(raw_quote, ("category", "service_type"), DEFAULT_QUOTE_CATEGORY),
        "base_price": base_price,
        "deposit_amount": deposit,
        "deposit_percent": round((deposit / base_price) * 100) if base_price > 0 else 0,
        "inclusions": raw_quote.get("inclusions", []),
        "exclusions": raw_quote.get("exclusions", []),
        "hidden_fees": _fee_list(raw_quote.get("hidden_fees")),
        "missing_disclosures": missing,
        "is_fully_disclosed": is_complete,
        "estimated_hidden_risk_score": len(missing) * HIDDEN_RISK_PER_MISSING,
    }


def compare_quotes(quotes: list[dict[str, Any]]) -> dict[str, Any]:
    """Compare multiple quotes side-by-side in a normalized matrix."""
    if not quotes:
        return {
            "count": 0,
            "normalized": [],
            "cheapest_id": None,
            "lowest_risk_id": None,
            "summary": "No quotes supplied.",
        }

    normalized = [normalize_quote(q) for q in quotes]
    normalized.sort(key=lambda x: x["base_price"])

    cheapest = normalized[0]
    lowest_risk = sorted(normalized, key=lambda x: len(x["missing_disclosures"]))[0]

    return {
        "count": len(normalized),
        "normalized": normalized,
        "cheapest_id": cheapest["id"],
        "cheapest_price": cheapest["base_price"],
        "lowest_risk_id": lowest_risk["id"],
        "comparison_summary": (
            f"Compared {len(normalized)} quotes. Lowest base quote is '{cheapest['name']}' "
            f"(${cheapest['base_price']:,.0f}), but '{lowest_risk['name']}' has the fewest missing disclosures "
            f"({len(lowest_risk['missing_disclosures'])} missing vs {len(cheapest['missing_disclosures'])})."
        ),
    }


def generate_follow_up_questions(quote: dict[str, Any]) -> list[str]:
    """Generate specific follow-up clarification questions for missing terms."""
    _, missing = audit_quote_completeness(quote)
    questions: list[str] = []

    for item in missing:
        if "cleanup" in item:
            questions.append(
                "Does the quoted fee include full post-event cleanup and waste removal, or is there an auxiliary teardown surcharge?"
            )
        elif "staff" in item:
            questions.append(
                "How many service staff members are included on-site during the contracted hours, and what is the gratuity policy?"
            )
        elif "Overtime" in item:
            questions.append(
                "What is the billing rate if speeches or dancing extend 30 to 60 minutes past the scheduled timeline?"
            )
        elif "Cancellation" in item:
            questions.append(
                "What are the refund milestones if an unexpected postponement or date change occurs?"
            )

    if not questions:
        questions.append(
            "Could you provide the certificate of vendor insurance for venue approval?"
        )
        questions.append("What is your delivery and electrical hookup arrival window?")

    return questions


__all__ = [
    "audit_quote_completeness",
    "compare_quotes",
    "extract_quote_from_raw_text",
    "generate_follow_up_questions",
    "normalize_quote",
]
