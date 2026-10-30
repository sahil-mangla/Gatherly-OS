"""Structured extraction from raw, unstructured vendor quote emails."""

import re
from typing import Any

from .quote_money import (
    find_deposit,
    find_hidden_fees,
    parse_money_items,
    pick_base_amount,
)

DEFAULT_VENDOR_NAME = "Extracted Vendor"
DEFAULT_SERVICE_TYPE = "decor"
CATEGORY_WORDS = (
    "Catering|Caterers|Photography|Photo|Photos|Florals|Floral|Flowers|Music|Venue|DJ|DJs"
    "|Events|Studio|Bakery|Band|Video|Rentals|Entertainment"
)
GREETING_RE = re.compile(
    r"^\s*(?:hi|hello|hey|dear\s+\w+)\b(?:\s+(?:there|team|all))?[\s,!.:-]*", re.I
)
CAP_WORD = r"[A-Z][\w&'’-]*"
LEADING_NAME_RE = re.compile(
    rf"^\W*({CAP_WORD}(?:\s+(?:&\s+)?{CAP_WORD}){{0,4}})\s*(?:\bhere\b|\bquote\b|\bproposal\b|—|–|-|:)"
)
CATEGORY_NAME_RE = re.compile(rf"\b((?:{CAP_WORD}\s+(?:&\s+)?){{1,3}}(?:{CATEGORY_WORDS}))\b")
STOP_WORDS = frozenset(
    "thanks thank hi hello hey dear please our the this quote here includes include package".split()
)
SERVICE_RULES = (
    ("photography", r"photo|shoot|image|gallery|videograph"),
    ("catering", r"cater|food|menu|drink|dinner|buffet|plated"),
    ("music", r"\bdj\b|band|music|playlist"),
    ("florals", r"floral|flower|bouquet|bloom"),
    ("venue", r"venue|ballroom|hall rental"),
)
INCLUDES_RE = re.compile(
    r"(?<!not )(?<!n't )\binclud(?:es?|ing|ed)\b\s*:?\s*(.+?)(?:[.;\n]|$)", re.I
)
INCLUSION_SPLIT_RE = re.compile(r",\s*(?:and\s+)?|\s+and\s+", re.I)
MAX_INCLUSIONS = 8
MAX_INCLUSION_LEN = 80

MISSING_CHECKS = (
    (r"staff|server|labor|crew|gratuity|service\s+charge", "Service staff & gratuity policy"),
    (r"clean|setup|breakdown|teardown", "Post-event cleanup & teardown fees"),
    (r"overtime|per\s*hour", "Overtime hourly billing rate"),
    (r"deposit|retainer|down\s*payment", "Deposit milestones and cancellation refund terms"),
)

CONFIDENCE_BASE = 0.3
CONFIDENCE_AMOUNT = 0.35
CONFIDENCE_NAME = 0.2
CONFIDENCE_DEPOSIT = 0.1
CONFIDENCE_FEES = 0.05
CONFIDENCE_CAP = 0.95
NO_AMOUNT_NOTE = "No dollar amount found in the text; base amount left at 0."


def _clean_name(name: str) -> str | None:
    words = name.split()
    while words and words[0].lower() in STOP_WORDS:
        words.pop(0)
    cleaned = " ".join(words)
    if not cleaned or re.fullmatch(CATEGORY_WORDS, cleaned, re.I):
        return None
    return cleaned


def extract_vendor_name(text: str) -> str | None:
    """Business name from a leading 'Name here/quote/—' phrase or 'Name + category word'."""
    body = GREETING_RE.sub("", text, count=1)
    for pattern, source in ((LEADING_NAME_RE, body), (CATEGORY_NAME_RE, body)):
        found = pattern.search(source)
        name = _clean_name(found.group(1)) if found else None
        if name:
            return name
    return None


def detect_service_type(name: str | None, text: str) -> str:
    """Service category from the vendor name first, then the whole message."""
    for haystack in (name or "", text):
        for service, pattern in SERVICE_RULES:
            if re.search(pattern, haystack, re.I):
                return service
    return DEFAULT_SERVICE_TYPE


def extract_inclusions(text: str) -> list[str]:
    """Items listed after 'includes'/'including' (never after 'does not include')."""
    items: list[str] = []
    for found in INCLUDES_RE.finditer(text):
        for part in INCLUSION_SPLIT_RE.split(found.group(1)):
            part = part.strip()
            if part and len(part) <= MAX_INCLUSION_LEN:
                items.append(part[:1].upper() + part[1:])
    return items[:MAX_INCLUSIONS]


def missing_disclosures(text: str) -> list[str]:
    """Essential terms (staffing, cleanup, overtime, deposit) the text never mentions."""
    return [label for pattern, label in MISSING_CHECKS if not re.search(pattern, text, re.I)]


def _confidence(has_amount: bool, has_name: bool, deposit_stated: bool, has_fees: bool) -> float:
    score = CONFIDENCE_BASE
    score += CONFIDENCE_AMOUNT if has_amount else 0.0
    score += CONFIDENCE_NAME if has_name else 0.0
    score += CONFIDENCE_DEPOSIT if deposit_stated else 0.0
    score += CONFIDENCE_FEES if has_fees else 0.0
    return round(min(CONFIDENCE_CAP, score), 2)


def _follow_up_questions(base: float) -> list[str]:
    first = (
        f"Could you clarify if setup and post-event teardown are included in the ${base:,.0f} quote?"
        if base > 0
        else "Could you confirm the total price and exactly what it covers?"
    )
    return [
        first,
        "What is the hourly overtime rate if the schedule extends past contracted hours?",
        "What is the exact payment schedule and cancellation refund timeline?",
    ]


def extract_quote_from_raw_text(text: str) -> dict[str, Any]:
    """Extract structured quote parameters from raw unstructured text."""
    items = parse_money_items(text)
    base, estimate_note = pick_base_amount(text, items)
    deposit, deposit_stated = find_deposit(text, items, base)
    fees = find_hidden_fees(text, items, base)
    name = extract_vendor_name(text)
    missing = missing_disclosures(text)

    notes = [estimate_note] if estimate_note else []
    flags = ["amount_estimated"] if estimate_note else []
    if base <= 0:
        notes.append(NO_AMOUNT_NOTE)
        flags.append("no_amount_found")

    return {
        "vendor_name": name or DEFAULT_VENDOR_NAME,
        "service_type": detect_service_type(name, text),
        "quoted_base_amount": base,
        "deposit_amount": deposit,
        "deposit_stated": deposit_stated,
        "hidden_fees": fees,
        "inclusions": extract_inclusions(text),
        "exclusions": missing,
        "missing_fields": missing,
        "confidence_score": _confidence(base > 0, bool(name), deposit_stated, bool(fees)),
        "follow_up_questions": _follow_up_questions(base),
        "notes": notes,
        "flags": flags,
    }
