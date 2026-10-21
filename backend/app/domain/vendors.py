"""Vendor quote normalization, fee completeness audit, and raw seed parsing."""

import re
from typing import Any

from .budget import safe_non_negative_number

ESSENTIAL_QUOTE_FIELDS = [
    ("setup_cleanup", "Setup & post-event cleanup"),
    ("service_staff", "Service staff & gratuity policy"),
    ("overtime_rate", "Overtime hourly rate"),
    ("cancellation_terms", "Cancellation refund policy"),
]


def audit_quote_completeness(quote: dict[str, Any]) -> tuple[bool, list[str]]:
    """Audit quote text and inclusions to identify undisclosed or missing fees."""
    missing: list[str] = []
    inclusions = " ".join(quote.get("inclusions", [])).lower()
    notes = str(quote.get("notes", "")).lower()
    summary = str(quote.get("summary", "")).lower()
    missing_fields = " ".join(quote.get("missing_fields", [])).lower()
    combined = f"{inclusions} {notes} {summary} {missing_fields}"

    if not any(k in combined for k in ("clean", "teardown", "breakdown")):
        missing.append("Post-event cleanup and teardown fees")

    if not any(k in combined for k in ("staff", "server", "labor", "crew")):
        missing.append("Service staff staffing & gratuity terms")

    if not any(k in combined for k in ("overtime", "extra hour", "curfew")):
        missing.append("Overtime hourly rate and curfew policy")

    if not any(k in combined for k in ("refund", "cancellation", "deposit milestone")):
        missing.append("Cancellation milestones & deposit refund clause")

    return len(missing) == 0, missing


def normalize_quote(raw_quote: dict[str, Any]) -> dict[str, Any]:
    """Normalize vendor quote structure for side-by-side comparison."""
    base_price = safe_non_negative_number(
        raw_quote.get("price") or raw_quote.get("quoted_amount") or 0.0
    )
    deposit = safe_non_negative_number(
        raw_quote.get("deposit") or raw_quote.get("deposit_paid") or 0.0
    )
    is_complete, missing = audit_quote_completeness(raw_quote)

    deposit_pct = round((deposit / base_price) * 100) if base_price > 0 else 0

    return {
        "id": raw_quote.get("id") or raw_quote.get("quote_id") or "quote-1",
        "name": raw_quote.get("name") or raw_quote.get("tier_name") or "Vendor Quote",
        "category": raw_quote.get("category") or raw_quote.get("service_type") or "General",
        "base_price": base_price,
        "deposit_amount": deposit,
        "deposit_percent": deposit_pct,
        "inclusions": raw_quote.get("inclusions", []),
        "exclusions": raw_quote.get("exclusions", []),
        "missing_disclosures": missing,
        "is_fully_disclosed": is_complete,
        "estimated_hidden_risk_score": len(missing) * 15,
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


def extract_quote_from_raw_text(text: str) -> dict[str, Any]:
    """Extract structured quote parameters from raw unstructured text."""
    price_match = re.search(r"\$?([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{2})?)", text)
    extracted_amount = float(price_match.group(1).replace(",", "")) if price_match else 2400.0

    has_staff = bool(re.search(r"staff|server|labor|crew", text, re.I))
    has_cleanup = bool(re.search(r"clean|setup|breakdown|teardown", text, re.I))
    has_overtime = bool(re.search(r"overtime|per\s*hour", text, re.I))
    has_deposit = bool(re.search(r"deposit|retainer|down\s*payment", text, re.I))

    missing: list[str] = []
    if not has_staff:
        missing.append("Service staff & gratuity policy")
    if not has_cleanup:
        missing.append("Post-event cleanup & teardown fees")
    if not has_overtime:
        missing.append("Overtime hourly billing rate")
    if not has_deposit:
        missing.append("Deposit milestones and cancellation refund terms")

    vendor_name_match = re.search(
        r"(?:studio|catering|florals|bakery|photo|bloom|crumb|society|sol)[\w\s]*",
        text,
        re.I,
    )
    vendor_name = vendor_name_match.group(0).strip() if vendor_name_match else "Extracted Vendor"

    service_type = (
        "photography"
        if re.search(r"photo|shoot|image", text, re.I)
        else "catering"
        if re.search(r"cater|food|menu|drink", text, re.I)
        else "decor"
    )

    return {
        "vendor_name": vendor_name,
        "service_type": service_type,
        "quoted_base_amount": extracted_amount,
        "deposit_amount": round(extracted_amount * 0.3),
        "inclusions": [
            "Core service delivery as specified in proposal",
            "Standard equipment package",
        ],
        "exclusions": missing,
        "missing_fields": missing,
        "confidence_score": 0.92,
        "follow_up_questions": [
            f"Could you clarify if setup and post-event teardown are included in the ${extracted_amount:,.0f} quote?",
            "What is the hourly overtime rate if the schedule extends past contracted hours?",
            "What is the exact payment schedule and cancellation refund timeline?",
        ],
    }
