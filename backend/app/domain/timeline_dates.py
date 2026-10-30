"""Date parsing helpers for timeline domain (mirrors frontend/src/js/domain/timeline-dates.js)."""

import re
from datetime import date

# YYYY-MM-DD, optionally followed by a time part ("T..." or " ..."); nothing else is a date.
_ISO_DATE = re.compile(r"([0-9]{4})-([0-9]{2})-([0-9]{2})(?:[T ].*)?", re.ASCII | re.DOTALL)


def parse_date(date_str: str) -> date | None:
    """Parse an ISO ``YYYY-MM-DD`` date (an optional time suffix is ignored); else ``None``."""
    match = _ISO_DATE.fullmatch(date_str) if isinstance(date_str, str) else None
    if match is None:
        return None
    try:
        return date(*map(int, match.groups()))
    except ValueError:
        return None
