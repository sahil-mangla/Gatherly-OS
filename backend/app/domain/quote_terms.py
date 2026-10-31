"""Which essential vendor terms a saved, extracted quote already states (text or fee)."""

from typing import Any

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


def saved_quotes_note(vendor: dict[str, Any]) -> str:
    """Lower-cased audit keywords for every term the vendor's saved quotes state."""
    stored = vendor.get("quotes")
    if not isinstance(stored, list):
        return ""
    return " ".join(stated_terms_note(q) for q in stored if isinstance(q, dict)).lower()
