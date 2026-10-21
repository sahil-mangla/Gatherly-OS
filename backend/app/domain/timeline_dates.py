"""Date parsing helpers for timeline domain."""

from datetime import date, datetime


def parse_date(date_str: str) -> date | None:
    """Parse an ISO date string."""
    try:
        return datetime.fromisoformat(date_str.split("T")[0]).date()
    except (ValueError, TypeError, AttributeError):
        return None
