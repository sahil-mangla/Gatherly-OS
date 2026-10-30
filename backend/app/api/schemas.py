"""Pydantic schemas for request validation and response models."""

import json
from typing import Annotated, Any, Literal

from pydantic import AfterValidator, BaseModel, Field

MAX_LIST = 100


def _cap_json(max_bytes: int) -> AfterValidator:
    """Reject free-form JSON documents whose serialised size exceeds ``max_bytes``."""

    def check(value: dict[str, Any]) -> dict[str, Any]:
        if len(json.dumps(value, default=str)) > max_bytes:
            raise ValueError(f"JSON document exceeds {max_bytes // 1024} KB limit")
        return value

    return AfterValidator(check)


Name = Annotated[str, Field(max_length=200)]
Label = Annotated[str, Field(max_length=100)]
Text = Annotated[str, Field(max_length=2000)]
ContextJson = Annotated[dict[str, Any], _cap_json(256 * 1024)]
EventJson = Annotated[dict[str, Any], _cap_json(512 * 1024)]


class ExpenseSchema(BaseModel):
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
    id: str | None = Field(default=None, max_length=64)
    title: Name
    category: Label = "General"
    due_date: str = Field(max_length=32)
    status: str = Field(default="todo", max_length=32)
    priority: str = Field(default="medium", max_length=32)
    depends_on: list[str] = Field(default_factory=list, max_length=MAX_LIST)
    is_fixed_deadline: bool = False


class ProposalSchema(BaseModel):
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
    operation: str = Field(default="general_advice", max_length=64)
    prompt: str = Field(default="", max_length=4000)
    context: ContextJson = Field(default_factory=dict)


class MaraResponse(BaseModel):
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
    event: ContextJson
    guest_delta: int = Field(default=0, ge=-100_000, le=100_000)
    catering_variance_pct: float = Field(default=0.0, ge=-100.0, le=1000.0)


class QuoteParseRequest(BaseModel):
    text: str = Field(max_length=20_000)


class QuotesListRequest(BaseModel):
    quotes: list[dict[str, Any]] = Field(max_length=MAX_LIST)


class EventPayloadRequest(BaseModel):
    event: ContextJson
    ref_date: str | None = Field(default=None, max_length=32)
