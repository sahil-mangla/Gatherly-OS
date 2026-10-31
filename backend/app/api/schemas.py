"""Pydantic schemas for request validation and response models."""

import json
from collections.abc import Callable
from typing import Annotated, Any, Literal

from pydantic import AfterValidator, BaseModel, Field

from ..config import settings

MAX_LIST = 100


def _cap_json(max_bytes: Callable[[], int]) -> AfterValidator:
    """Reject free-form JSON documents whose serialised size exceeds ``max_bytes()`` (per call)."""

    def check(value: dict[str, Any]) -> dict[str, Any]:
        limit = max_bytes()
        if len(json.dumps(value, default=str)) > limit:
            raise ValueError(f"JSON document exceeds {limit // 1024} KB limit")
        return value

    return AfterValidator(check)


Name = Annotated[str, Field(max_length=200)]
Label = Annotated[str, Field(max_length=100)]
Text = Annotated[str, Field(max_length=2000)]
ContextJson = Annotated[dict[str, Any], _cap_json(lambda: 256 * 1024)]
EventJson = Annotated[dict[str, Any], _cap_json(lambda: settings.max_state_json_bytes)]


class ExpenseSchema(BaseModel):
    """One budget line with planned, actual and committed amounts."""

    id: str | None = Field(default=None, max_length=64)
    category: Label
    description: Text
    planned_amount: float = Field(ge=0.0)
    actual_amount: float = Field(default=0.0, ge=0.0)
    committed_amount: float = Field(default=0.0, ge=0.0)
    status: str = Field(default="pending", max_length=32)
    vendor_id: str | None = Field(default=None, max_length=64)
    cost_per_guest: float = Field(default=0.0, ge=0.0)


class TaskSchema(BaseModel):
    """One timeline milestone with its due date, status and prerequisites."""

    id: str | None = Field(default=None, max_length=64)
    title: Name
    category: Label = "General"
    due_date: str = Field(max_length=32)
    status: str = Field(default="todo", max_length=32)
    priority: str = Field(default="medium", max_length=32)
    depends_on: list[str] = Field(default_factory=list, max_length=MAX_LIST)
    is_fixed_deadline: bool = False


class ProposalSchema(BaseModel):
    """A Mara suggestion the user can approve or dismiss."""

    id: str = Field(max_length=100)
    action: Literal["reallocate", "update_expense", "add_task", "custom"]
    title: Name
    description: Text
    category: Label | None = None
    from_category: Label | None = None
    to_category: Label | None = None
    amount: float | None = Field(default=None, ge=0.0)
    savings: float | None = Field(default=None, ge=0.0)
    consequence: Text | None = None
    risk_impact: Text | None = None


class MaraRequest(BaseModel):
    """Question or operation sent to the Mara copilot, with the event context."""

    operation: str = Field(default="general_advice", max_length=64)
    prompt: str = Field(default="", max_length=4000)
    context: ContextJson = Field(default_factory=dict)


class MaraResponse(BaseModel):
    """Mara's answer; which fields are set depends on the operation."""

    success: bool
    summary: str | None = None
    response: str | None = None
    headline: str | None = None
    advice: str | None = None
    cause: str | None = None
    consequence: str | None = None
    suggested_action: str | None = None
    proposals: list[ProposalSchema] | None = Field(default=None, max_length=MAX_LIST)
    extracted_quote: dict[str, Any] | None = None
    provider: str = "deterministic_mock"


class SimulationRequest(BaseModel):
    """What-if deltas applied to an event by ``/api/simulate``."""

    event: ContextJson
    guest_delta: int = Field(default=0, ge=-100_000, le=100_000)
    catering_variance_pct: float = Field(default=0.0, ge=-100.0, le=1000.0)


class QuoteParseRequest(BaseModel):
    """Raw vendor quote text to extract structured terms from."""

    text: str = Field(max_length=20_000)


class QuotesListRequest(BaseModel):
    """Quotes to compare side by side."""

    quotes: list[dict[str, Any]] = Field(max_length=MAX_LIST)


class EventPayloadRequest(BaseModel):
    """An event snapshot sent to the stateless risk and budget endpoints."""

    event: ContextJson
    ref_date: str | None = Field(default=None, max_length=32)
