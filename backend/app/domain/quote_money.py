"""Dollar-amount, deposit and hidden-fee extraction for raw vendor quote text.

Every dollar amount (``$`` prefix required, so bare guest counts are never picked up) is
classified from the words around it, then the base price, deposit and fees are derived.
"""

import re
from typing import Any

from .budget import PERCENT_SCALE
from .quote_percent import DEPOSIT_WORDS, classify_percents

MONEY_RE = re.compile(r"\$\s?([0-9]{1,3}(?:,[0-9]{3}){1,4}|[0-9]{1,12})(?![0-9])(?:\.[0-9]{1,2})?")
CLAUSE_SPLIT_RE = re.compile(r"[.;!?\n]|,\s")
PREFIX_WINDOW = 30
SUFFIX_WINDOW = 30

OVERTIME_WORDS = r"over\s*time|extra\s+hours?|additional\s+hours?"
CLEANUP_WORDS = r"clean\s*-?up|tear\s*down|break\s*down|set\s*-?up"
FEE_WORDS = r"travel|delivery|parking|permit|corkage|cake\s+cutting|fees?|surcharge"
TOTAL_RE = re.compile(r"\btotal\b")
EXPLICIT_RE = re.compile(r"=|\bpackage\b|\bbase\b|\bflat\b|all-in|comes\s+to|\bquoted?\b|\bprice\b")
UNIT_RE = re.compile(r"\s*(?:/|per\s+|an?\s+|each\s+)\s*(hr|hour|person|guest|head|pp|plate)")
BEFORE_UNIT_RE = re.compile(
    r"\bper\s{1,3}(person|guest|head|plate)\s{0,3}(?:(?:is|of|at)\s{1,3})?[:\-\u2013]?\s{0,3}$"
)
HOUR_UNITS = ("hr", "hour")
GUESTS_RE = re.compile(r"([0-9]{1,5})\s{0,3}(?:guests?|people|attendees|persons|ppl)", re.I)
AFTER_FILLER = r"(?:(?:/\s*hr|/\s*hour|per\s+hour|an\s+hour|flat|for|the|a|an)\s*){0,3}"
DEPOSIT_AFTER_RE = re.compile(
    rf"\s*(?:(?:non-refundable|refundable|required|upfront|due|as|is|a|the)\s+){{0,2}}"
    rf"(?:{DEPOSIT_WORDS})"
)
FEE_LABELS = {
    "overtime": "Overtime rate",
    "cleanup": "Cleanup / setup fee",
    "fee": "Additional fee",
}
KIND_ORDER = (("overtime", OVERTIME_WORDS), ("cleanup", CLEANUP_WORDS), ("fee", FEE_WORDS))
RATE_ESTIMATE_NOTE = "Base amount estimated from per-person rate x guest count."
TIER_TOTAL, TIER_EXPLICIT, TIER_PLAIN = 0, 1, 2


def _clause_context(text: str, matches: list[re.Match[str]], idx: int) -> tuple[str, str]:
    """Lower-cased text just before and after match ``idx`` within its own clause."""
    match = matches[idx]
    prev_end = matches[idx - 1].end() if idx else 0
    next_start = matches[idx + 1].start() if idx + 1 < len(matches) else len(text)
    before = CLAUSE_SPLIT_RE.split(text[prev_end : match.start()])[-1][-PREFIX_WINDOW:]
    after = CLAUSE_SPLIT_RE.split(text[match.end() : next_start])[0][:SUFFIX_WINDOW]
    return before.lower(), after.lower()


def _mentions(words: str, before: str, after: str) -> bool:
    return bool(re.search(words, before) or re.match(rf"\s*{AFTER_FILLER}(?:{words})", after))


def _classify(before: str, after: str, taken: bool) -> str:
    """Return deposit | overtime | cleanup | fee | rate | amount for one dollar figure."""
    if re.search(DEPOSIT_WORDS, before) or DEPOSIT_AFTER_RE.match(after):
        return "deposit"
    if not TOTAL_RE.search(before):
        for kind, words in KIND_ORDER:
            if _mentions(words, before, after):
                return kind
    return "rate" if _unit(before, after, taken) else "amount"


def _unit(before: str, after: str, taken: bool) -> str | None:
    """Unit of a rate: ``/hr`` or ``per plate`` after the figure, or ``Per plate`` before it.

    ``taken`` means the previous figure already owns a unit phrase at the start of this gap
    ("$48 per person: $7,200"), so that phrase is not this figure's unit.
    """
    found = UNIT_RE.match(after)
    if found:
        return found.group(1)
    found = BEFORE_UNIT_RE.search(before)
    if found and not (taken and not before[: found.start()].strip()):
        return found.group(1)
    return None


def parse_money_items(text: str) -> list[dict[str, Any]]:
    """Every ``$`` figure in ``text`` with its inferred kind, unit and priority tier."""
    matches = list(MONEY_RE.finditer(text))
    items: list[dict[str, Any]] = []
    taken = False
    for idx, match in enumerate(matches):
        before, after = _clause_context(text, matches, idx)
        items.append(
            {
                "amount": float(match.group(0).replace("$", "").replace(",", "").strip()),
                "kind": _classify(before, after, taken),
                "unit": _unit(before, after, taken),
                "tier": _tier(before),
            }
        )
        taken = bool(UNIT_RE.match(after))
    return items


def _tier(before: str) -> int:
    if TOTAL_RE.search(before):
        return TIER_TOTAL
    return TIER_EXPLICIT if EXPLICIT_RE.search(before) else TIER_PLAIN


def _rate_times_guests(text: str, items: list[dict[str, Any]]) -> float:
    """Estimate a base price from a per-person rate and a stated guest count (else 0)."""
    guests = GUESTS_RE.search(text)
    rates = [i["amount"] for i in items if i["kind"] == "rate" and i["unit"] not in HOUR_UNITS]
    return max(rates) * int(guests.group(1)) if guests and rates else 0.0


def pick_base_amount(text: str, items: list[dict[str, Any]]) -> tuple[float, str | None]:
    """Choose the base price: explicit totals, then largest amount, then rate x guests."""
    candidates = [i for i in items if i["kind"] == "amount"]
    if candidates:
        best_tier = min(i["tier"] for i in candidates)
        return max(i["amount"] for i in candidates if i["tier"] == best_tier), None
    estimate = _rate_times_guests(text, items)
    return estimate, (RATE_ESTIMATE_NOTE if estimate else None)


def find_deposit(text: str, items: list[dict[str, Any]], base: float) -> tuple[float, bool]:
    """Return (deposit amount, stated). Never invents a deposit the text does not mention."""
    for item in items:
        if item["kind"] == "deposit":
            return item["amount"], True
    percent, _ = classify_percents(text)
    if percent is not None:
        return round(base * percent / PERCENT_SCALE, 2), True
    return 0.0, False


def _format_rate(rate: float) -> str:
    return format(rate, "f").rstrip("0").rstrip(".")


def _percent_fee(word: str, rate: float, base: float) -> dict[str, Any]:
    label = " ".join(word.lower().split())
    return {
        "type": "gratuity" if label.startswith(("gratuity", "tip")) else "service_charge",
        "label": f"{label.title()} {_format_rate(rate)}%",
        "unit": "percent",
        "rate": rate,
        "amount": round(base * rate / PERCENT_SCALE, 2),
    }


def find_hidden_fees(text: str, items: list[dict[str, Any]], base: float) -> list[dict[str, Any]]:
    """Overtime / cleanup / other dollar fees plus gratuity and service-charge percentages."""
    fees = [
        {
            "type": item["kind"],
            "label": FEE_LABELS[item["kind"]],
            "unit": "per_hour" if item["unit"] in HOUR_UNITS else "flat",
            "rate": item["amount"],
            "amount": item["amount"],
        }
        for item in items
        if item["kind"] in FEE_LABELS
    ]
    fees.extend(_percent_fee(fee.word, fee.rate, base) for fee in classify_percents(text)[1])
    return fees
