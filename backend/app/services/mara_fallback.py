"""Deterministic, schema-compliant Mara responses used when no live model is available."""

from collections.abc import Callable
from typing import Any

from ..domain.vendors import extract_quote_from_raw_text

Handler = Callable[[dict[str, Any], str], dict[str, Any]]
MAX_REALLOCATION = 1200.0
TRIM_RATE = 0.05


def _is_number(value: Any) -> bool:
    """True for real numbers; booleans are ints in Python but are never amounts."""
    return isinstance(value, int | float) and not isinstance(value, bool)


def _num(value: Any) -> float:
    return float(value) if _is_number(value) else 0.0


def _pretty(name: str) -> str:
    return name.replace("_", " ").replace("-", " ").strip().title() or "General"


def _category_rows(budget: dict[str, Any]) -> list[tuple[str, float, float]]:
    """(name, planned, allocated) for every real category present in the budget context."""
    cats = budget.get("categories")
    if not isinstance(cats, dict):
        return []
    return [
        (name[:100], _num(info.get("planned")), _num(info.get("allocated")))
        for name, info in cats.items()
        if isinstance(name, str) and isinstance(info, dict)
    ]


def _custom_proposal() -> dict[str, Any]:
    return {
        "id": "prop-fixed-fee-caps",
        "action": "custom",
        "title": "Lock Fixed-Fee Caps With Remaining Vendors",
        "description": "Request not-to-exceed totals on open quotes before approving upgrades.",
        "consequence": "Requires one follow-up task per vendor before deposits are released.",
        "risk_impact": "Reduces exposure to late overtime and add-on fees.",
    }


def _realloc_proposal(rows: list[tuple[str, float, float]]) -> dict[str, Any] | None:
    """Move headroom from the roomiest category to the most over-allocated one."""
    if len(rows) < 2:
        return None
    needy = max(rows, key=lambda r: r[2] - r[1])
    donor = max((r for r in rows if r[0] != needy[0]), key=lambda r: r[1] - r[2])
    amount = min(MAX_REALLOCATION, round((donor[1] - donor[2]) * 0.5))
    if amount <= 0:
        return None
    return {
        "id": "prop-realloc",
        "action": "reallocate",
        "title": f"Reallocate {_pretty(donor[0])} Buffer to {_pretty(needy[0])}",
        "description": f"Shift ${amount:,.0f} of unused {_pretty(donor[0])} budget into "
        f"{_pretty(needy[0])} to cover committed spend.",
        "from_category": donor[0],
        "to_category": needy[0],
        "amount": float(amount),
        "consequence": f"Leaves {_pretty(donor[0])} with its remaining planned allocation.",
        "risk_impact": "Reduces the chance of a budget overrun alert.",
    }


def _trim_proposal(rows: list[tuple[str, float, float]]) -> dict[str, Any] | None:
    """Suggest a modest trim on the largest real spend category."""
    biggest = max(rows, key=lambda r: r[2], default=None)
    if not biggest or biggest[2] <= 0:
        return None
    savings = float(round(biggest[2] * TRIM_RATE))
    return {
        "id": "prop-trim-largest",
        "action": "update_expense",
        "title": f"Trim {_pretty(biggest[0])} Scope by 5%",
        "description": f"Negotiate small scope or quantity reductions in {_pretty(biggest[0])}.",
        "category": biggest[0],
        "savings": savings,
        "consequence": f"Saves about ${savings:,.0f} with minimal guest-facing impact.",
        "risk_impact": "Increases uncommitted contingency buffer.",
    }


def _cost_saving(ctx: dict[str, Any], _prompt: str) -> dict[str, Any]:
    budget = ctx.get("budget") if isinstance(ctx.get("budget"), dict) else {}
    rows = _category_rows(budget)
    found = [_realloc_proposal(rows), _trim_proposal(rows)]
    proposals = [p for p in found if p] + [_custom_proposal()]
    return {
        "summary": f"Identified {len(proposals)} balanced adjustments based on your "
        f"{len(rows)} budget categories while preserving guest experience.",
        "proposals": proposals,
    }


def _parse_quote(_ctx: dict[str, Any], prompt: str) -> dict[str, Any]:
    return {"extracted_quote": extract_quote_from_raw_text(prompt)}


def _open_task_titles(ctx: dict[str, Any]) -> list[str]:
    tasks = ctx.get("tasks") if isinstance(ctx.get("tasks"), list) else []
    open_tasks = [t for t in tasks if isinstance(t, dict) and t.get("status") != "done"]
    open_tasks.sort(key=lambda t: str(t.get("due_date") or "9999"))
    return [str(t["title"])[:100] for t in open_tasks[:2] if t.get("title")]


def _prioritize(ctx: dict[str, Any], _prompt: str) -> dict[str, Any]:
    titles = _open_task_titles(ctx)
    if not titles:
        return {
            "headline": "Review your critical path this week",
            "advice": "Confirm open vendor contracts and upcoming deadlines before adding scope.",
        }
    return {
        "headline": f"Focus on {len(titles)} critical path item{'s' if len(titles) > 1 else ''}",
        "advice": "Prioritize sign-off on: " + "; ".join(titles) + ".",
    }


def _risk_explanation(ctx: dict[str, Any], _prompt: str) -> dict[str, Any]:
    risks = ctx.get("risks") if isinstance(ctx.get("risks"), list) else []
    top = risks[0] if risks and isinstance(risks[0], dict) else {}
    evidence = _clean_evidence(top.get("evidence"))
    return {
        "cause": evidence,
        "consequence": "Could exhaust your contingency before final vendor deposits are due.",
        "suggested_action": "Lock in remaining quotes with fixed-fee caps before approving "
        "additional aesthetic upgrades.",
    }


def _clean_evidence(value: Any) -> str:
    default = "Committed expenses are tracking faster than scheduled milestones."
    return value[:500] if isinstance(value, str) and value else default


def _general(ctx: dict[str, Any], _prompt: str) -> dict[str, Any]:
    event = ctx.get("event") if isinstance(ctx.get("event"), dict) else {}
    budget = ctx.get("budget") if isinstance(ctx.get("budget"), dict) else {}
    name = str(event.get("name") or "your celebration")[:100]
    text = f"Mara analyzed the current state for '{name}'."
    total, remaining = budget.get("total_budget"), budget.get("remaining_uncommitted")
    if _is_number(total) and _is_number(remaining):
        text += f" Total budget is ${total:,.0f} with ${remaining:,.0f} breathing room remaining."
    return {"response": text}


HANDLERS: dict[str, Handler] = {
    "cost_saving_proposals": _cost_saving,
    "parse_quote_seed": _parse_quote,
    "prioritize_tasks": _prioritize,
    "risk_explanation": _risk_explanation,
}


def generate_deterministic_mara_response(
    operation: str, context: dict[str, Any], prompt: str = ""
) -> dict[str, Any]:
    """Deterministic, schema-compliant copilot response generator."""
    ctx = context if isinstance(context, dict) else {}
    body = HANDLERS.get(operation, _general)(ctx, prompt)
    return {"success": True, **body, "provider": "deterministic_mock"}
