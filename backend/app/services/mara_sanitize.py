"""Server-side validation of model output before it reaches the API response."""

import math
from typing import Any

ALLOWED_ACTIONS = frozenset({"reallocate", "update_expense", "add_task", "custom"})
TEXT_FIELDS = (
    "summary",
    "response",
    "headline",
    "advice",
    "cause",
    "consequence",
    "suggested_action",
)
MAX_TEXT = 2000
MAX_LABEL = 100
MAX_PROPOSALS = 20
MAX_AMOUNT = 1e9
MAX_QUOTE_KEYS = 30


def clean_text(value: Any, limit: int = MAX_TEXT) -> str | None:
    """Return a trimmed string or None when the value is not a string."""
    return value.strip()[:limit] if isinstance(value, str) else None


def clean_amount(value: Any) -> float | None:
    """Clamp a numeric amount to [0, MAX_AMOUNT]; reject bools, NaN and infinities."""
    if isinstance(value, bool) or not isinstance(value, int | float) or not math.isfinite(value):
        return None
    return float(min(max(value, 0.0), MAX_AMOUNT))


def sanitize_proposal(raw: Any, index: int) -> dict[str, Any] | None:
    """Validate one proposal; unknown actions or missing titles drop the proposal."""
    if not isinstance(raw, dict) or raw.get("action") not in ALLOWED_ACTIONS:
        return None
    title = clean_text(raw.get("title"), 200)
    if not title:
        return None
    proposal: dict[str, Any] = {
        "id": clean_text(raw.get("id"), MAX_LABEL) or f"prop-{index}",
        "action": raw["action"],
        "title": title,
        "description": clean_text(raw.get("description")) or "",
    }
    for key in ("category", "from_category", "to_category"):
        proposal[key] = clean_text(raw.get(key), MAX_LABEL)
    for key in ("amount", "savings"):
        proposal[key] = clean_amount(raw.get(key))
    for key in ("consequence", "risk_impact"):
        proposal[key] = clean_text(raw.get(key))
    return proposal


def sanitize_quote(raw: Any) -> dict[str, Any] | None:
    """Keep only scalar, size-bounded values from a model-extracted vendor quote."""
    if not isinstance(raw, dict):
        return None
    quote: dict[str, Any] = {}
    for key, value in list(raw.items())[:MAX_QUOTE_KEYS]:
        if isinstance(value, bool | int | float | str | type(None)):
            quote[str(key)[:MAX_LABEL]] = value[:500] if isinstance(value, str) else value
    return quote


def sanitize_proposals(raw: Any) -> list[dict[str, Any]]:
    """Validate a list of proposals, dropping invalid entries and capping the count."""
    if not isinstance(raw, list):
        return []
    cleaned = (sanitize_proposal(p, i) for i, p in enumerate(raw[:MAX_PROPOSALS]))
    return [p for p in cleaned if p]


def sanitize_model_output(parsed: Any) -> dict[str, Any] | None:
    """Reduce parsed model JSON to the response contract; None means nothing usable."""
    if not isinstance(parsed, dict):
        return None
    result: dict[str, Any] = {}
    for field in TEXT_FIELDS:
        if text := clean_text(parsed.get(field)):
            result[field] = text
    if proposals := sanitize_proposals(parsed.get("proposals")):
        result["proposals"] = proposals
    if quote := sanitize_quote(parsed.get("extracted_quote")):
        result["extracted_quote"] = quote
    return {"success": True, **result} if result else None
