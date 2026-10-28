"""Mara Planning Copilot Service.

Provides structured recommendations, diagnostic explanations, and fallback mode.
"""

import json
import urllib.error
import urllib.request
from datetime import date
from typing import Any

from ..config import settings
from ..domain.vendors import extract_quote_from_raw_text


def generate_deterministic_mara_response(
    operation: str, context: dict[str, Any], prompt: str = ""
) -> dict[str, Any]:
    """Deterministic, schema-compliant copilot response generator."""
    ctx = context if isinstance(context, dict) else {}
    event = ctx.get("event") if isinstance(ctx.get("event"), dict) else {}
    budget = ctx.get("budget") if isinstance(ctx.get("budget"), dict) else {}
    risks = ctx.get("risks") if isinstance(ctx.get("risks"), list) else []

    if operation == "cost_saving_proposals":
        cats = budget.get("categories") if isinstance(budget.get("categories"), dict) else {}
        catering_info = cats.get("catering") if isinstance(cats.get("catering"), dict) else {}
        catering_alloc = catering_info.get("allocated", 4780)
        realloc_amount = min(1200.0, round(catering_alloc * 0.15))

        return {
            "success": True,
            "summary": "Identified 3 balanced adjustments to absorb catering variance while preserving guest experience.",
            "proposals": [
                {
                    "id": "prop-realloc-decor",
                    "action": "reallocate",
                    "title": "Reallocate Design Buffer to Catering",
                    "description": f"Shift ${realloc_amount:,.0f} from Design & Flowers buffer into Food & Drink to balance the confirmed catering quote.",
                    "from_category": "design",
                    "to_category": "catering",
                    "amount": realloc_amount,
                    "consequence": "Leaves floral design with essential table centerpieces and focal ceremony arch.",
                    "risk_impact": "Eliminates pending budget overrun alert.",
                },
                {
                    "id": "prop-streamline-dessert",
                    "action": "update_expense",
                    "title": "Streamline Dessert & Late-Night Bites",
                    "description": "Opt for single-tier celebration cake plus kitchen sheet cutting cakes instead of custom multi-tier assembly.",
                    "category": "catering",
                    "savings": 450.0,
                    "consequence": "Saves $450 in structural bakery charges with identical taste and portioning.",
                    "risk_impact": "Increases uncommitted contingency buffer.",
                },
                {
                    "id": "prop-corkage-opt",
                    "action": "custom",
                    "title": "BYO Beverage & Fixed Corkage Agreement",
                    "description": "Source boutique wines directly from regional distributor under venue corkage terms.",
                    "consequence": "Requires 1 additional logistics task for advance drop-off.",
                    "risk_impact": "Improves beverage spend efficiency by ~18%.",
                },
            ],
            "provider": "deterministic_mock",
        }

    if operation == "parse_quote_seed":
        extracted = extract_quote_from_raw_text(prompt)
        return {
            "success": True,
            "extracted_quote": extracted,
            "provider": "deterministic_mock",
        }

    if operation == "prioritize_tasks":
        return {
            "success": True,
            "headline": "Focus on 2 critical path items this week",
            "advice": "Menu tasting and photographer contract need sign-off before invitation details can be finalized.",
            "provider": "deterministic_mock",
        }

    if operation == "risk_explanation":
        target_risk = (
            risks[0]
            if risks
            else {
                "title": "Budget Allocation Warning",
                "evidence": "High committed spend tracking ahead of scheduled timeline.",
            }
        )
        return {
            "success": True,
            "cause": target_risk.get(
                "evidence", "Committed expenses are tracking faster than scheduled milestones."
            ),
            "consequence": "Could exhaust your contingency before final vendor deposits are due.",
            "suggested_action": "Lock in remaining quotes with fixed-fee caps before approving additional aesthetic upgrades.",
            "provider": "deterministic_mock",
        }

    total_b = budget.get("total_budget", 24000) if isinstance(budget, dict) else 24000
    rem_u = budget.get("remaining_uncommitted", 5540) if isinstance(budget, dict) else 5540
    return {
        "success": True,
        "response": (
            f"Mara analyzed the current state for '{event.get('name', 'your celebration')}'. "
            f"Total budget is ${total_b:,.0f} with ${rem_u:,.0f} breathing room remaining."
        ),
        "provider": "deterministic_mock",
    }


def query_mara_copilot(operation: str, prompt: str, context: dict[str, Any]) -> dict[str, Any]:
    """Execute copilot request via Gemini API if key is present; otherwise use fallback."""
    api_key = settings.gemini_api_key

    if api_key and api_key != "placeholder":
        try:
            system_instruction = (
                "You are Mara, an expert celebration and event planning copilot for Gatherly. "
                "Always return valid JSON conforming to the requested schema. "
                "Do not wrap output in markdown code blocks. "
                f"Today's date is {date.today().isoformat()}; judge deadlines against it."
            )
            payload = {
                "system_instruction": {"parts": [{"text": system_instruction}]},
                "contents": [
                    {
                        "parts": [
                            {
                                "text": f"Operation: {operation}\nContext: {json.dumps(context)}\nUser Prompt: {prompt}\nReturn valid JSON."
                            }
                        ]
                    }
                ],
                "generationConfig": {
                    "responseMimeType": "application/json",
                    "temperature": 0.2,
                },
            }

            model = settings.gemini_model or "gemini-2.5-flash"
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
            req = urllib.request.Request(
                url,
                data=json.dumps(payload).encode("utf-8"),
                headers={"Content-Type": "application/json"},
                method="POST",
            )

            with urllib.request.urlopen(req, timeout=6.0) as resp:
                if resp.status == 200:
                    data = json.loads(resp.read().decode("utf-8"))
                    text = data["candidates"][0]["content"]["parts"][0]["text"]
                    parsed = json.loads(text)
                    if isinstance(parsed, dict):
                        parsed.setdefault("success", True)
                        parsed["provider"] = "gemini-live"
                        return parsed
        except Exception:
            # Gracefully log and fall through to deterministic mock
            pass

    return generate_deterministic_mara_response(operation, context, prompt)
