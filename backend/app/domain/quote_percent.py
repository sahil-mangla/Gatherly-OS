"""Clause-aware percentage classification for raw vendor quote text.

Every ``N%`` token is classified exactly once, in this order:

1. Followed (after optional whitespace) by deposit | retainer | down payment, optionally
   ``non-refundable`` -> the deposit percentage, never a fee.
2. Followed (after whitespace only) by a fee word (gratuity, tip, service charge/fee, admin fee)
   -> belongs to that word, which becomes claimed ("N% word" wins over "word N%").
3. Preceded by an *unclaimed* fee word, at most 12 characters earlier and with no ``.`` ``;``
   newline, digit or ``%`` in between -> belongs to that word.
4. Otherwise ignored.

Every digit run is bounded and anchored (no unbounded ``\\s*`` next to digits), so scanning is
linear even on adversarial input. ASCII ``[0-9]`` keeps Python and JavaScript identical.
"""

import re
from bisect import bisect_left, bisect_right
from typing import NamedTuple

DEPOSIT_WORDS = r"deposit|retainer|down\s{0,3}payment"
NUMBER = r"(?<![0-9.])([0-9]{1,9}(?:\.[0-9]{1,4})?)"
PCT_RE = re.compile(rf"{NUMBER}\s{{0,3}}%")
FEE_WORD_RE = re.compile(
    r"\b(gratuity|tip|service\s{1,4}charge|service\s{1,4}fee|admin(?:istrative)?\s{1,4}fee)\b",
    re.I,
)
DEPOSIT_AFTER_RE = re.compile(rf"\s{{0,4}}(?:non-refundable\s{{1,4}})?(?:{DEPOSIT_WORDS})", re.I)
DEPOSIT_BEFORE_RE = re.compile(
    rf"(?:{DEPOSIT_WORDS})\s{{0,3}}(?:of|is|:)?\s{{0,3}}{NUMBER}\s{{0,3}}%", re.I
)
GAP_BREAK_RE = re.compile(r"[.;\n\r0-9%]")
BLANK_RE = re.compile(r"\s*")
FOLLOW_GAP = 4
PRECEDE_GAP = 12


class PercentFee(NamedTuple):
    """One gratuity / service-charge percentage: the fee word as written and its rate."""

    word: str
    rate: float


class _Words(NamedTuple):
    found: list[re.Match[str]]
    starts: list[int]
    ends: list[int]


def _following_word(text: str, pct: re.Match[str], words: _Words) -> int | None:
    """Index of the fee word that directly follows ``pct`` (whitespace only between)."""
    idx = bisect_left(words.starts, pct.end())
    if idx == len(words.starts) or words.starts[idx] - pct.end() > FOLLOW_GAP:
        return None
    return idx if BLANK_RE.fullmatch(text, pct.end(), words.starts[idx]) else None


def _preceding_word(text: str, pct: re.Match[str], words: _Words) -> int | None:
    """Index of the nearest fee word ending shortly before ``pct`` in the same clause."""
    idx = bisect_right(words.ends, pct.start()) - 1
    if idx < 0 or pct.start() - words.ends[idx] > PRECEDE_GAP:
        return None
    return None if GAP_BREAK_RE.search(text, words.ends[idx], pct.start()) else idx


def _first_pass(
    text: str, pcts: list[re.Match[str]], words: _Words
) -> tuple[float | None, dict[int, re.Match[str]], list[re.Match[str]]]:
    """Rules 1 and 2: the deposit percentage, 'N% word' claims and the unresolved rest."""
    deposit: float | None = None
    claims: dict[int, re.Match[str]] = {}
    rest: list[re.Match[str]] = []
    for pct in pcts:
        if DEPOSIT_AFTER_RE.match(text, pct.end()):
            deposit = float(pct.group(1)) if deposit is None else deposit
            continue
        idx = _following_word(text, pct, words)
        if idx is None:
            rest.append(pct)
        else:
            claims[idx] = pct
    return deposit, claims, rest


def classify_percents(text: str) -> tuple[float | None, list[PercentFee]]:
    """Return (deposit percentage or None, gratuity/service-charge fees in text order)."""
    found = list(FEE_WORD_RE.finditer(text))
    words = _Words(found, [w.start() for w in found], [w.end() for w in found])
    deposit, claims, rest = _first_pass(text, list(PCT_RE.finditer(text)), words)
    for pct in rest:
        idx = _preceding_word(text, pct, words)
        if idx is not None and idx not in claims:
            claims[idx] = pct
    ordered = sorted(claims.items(), key=lambda item: item[1].start())
    fees = [PercentFee(found[i].group(1), float(p.group(1))) for i, p in ordered]
    if deposit is None:
        before = DEPOSIT_BEFORE_RE.search(text)
        deposit = float(before.group(1)) if before else None
    return deposit, fees
