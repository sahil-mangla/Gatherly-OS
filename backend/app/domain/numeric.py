"""Numeric coercion and rounding shared by the domain engines.

Mirrors frontend/src/js/domain/numeric.js so both languages agree on every edge case: only plain
decimal numbers (or numeric strings) are accepted, non-finite values are rejected, and halves
round up (never to even).
"""

import math
import re
from typing import Any

_DECIMAL = re.compile(r"\s*[+-]?([0-9]+\.?[0-9]*|\.[0-9]+)([eE][+-]?[0-9]+)?\s*", re.ASCII)


def number_or(value: Any, default: Any) -> Any:
    """``value`` as a finite float, or ``default`` when it is not a plain finite number."""
    if isinstance(value, str) and not _DECIMAL.fullmatch(value):
        return default
    try:
        num = float(value)
    except (TypeError, ValueError, OverflowError):
        return default
    return num if math.isfinite(num) else default


def safe_non_negative_number(val: Any) -> float:
    """Sanitize any numeric or string input into a valid non-negative float."""
    return max(0.0, number_or(val, 0.0))


def to_int(value: Any, default: int) -> int:
    """``value`` truncated toward zero, or ``default`` when it is not a finite number."""
    num = number_or(value, None)
    return default if num is None else int(num)


def round_half_up(value: float) -> int:
    """Round to the nearest integer, halves toward +infinity (matches JavaScript Math.round)."""
    return math.floor(value + 0.5)


def format_amount(value: float) -> str:
    """Whole-number amount with comma grouping, e.g. ``1,235``."""
    return f"{round_half_up(value):,}"


def format_signed_tenths(value: float) -> str:
    """Signed one-decimal text with halves rounded up, e.g. ``+12.3`` or ``-0.5``."""
    tenths = round_half_up(abs(value) * 10)
    return f"{'-' if value < 0 else '+'}{tenths // 10}.{tenths % 10}"
