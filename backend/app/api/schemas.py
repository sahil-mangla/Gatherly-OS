"""Pydantic schemas for request validation and response models."""

from typing import Any, Literal

from pydantic import BaseModel, Field


class ExpenseSchema(BaseModel):
    id: str | None = None
    category: str
    description: str
    planned_amount: float = Field(ge=0.0)
    actual_amount: float = Field(default=0.0, ge=0.0)
    committed_amount: float = Field(default=0.0, ge=0.0)
    status: str = "pending"
    vendor_id: str | None = None
    cost_per_guest: float = 0.0


class TaskSchema(BaseModel):
    id: str | None = None
    title: str
    category: str = "General"
    due_date: str
    status: str = "todo"
    priority: str = "medium"
    depends_on: list[str] = Field(default_factory=list)
    is_fixed_deadline: bool = False


class ProposalSchema(BaseModel):
    id: str
    action: Literal["reallocate", "update_expense", "add_task", "custom"]
    title: str
    description: str
    from_category: str | None = None
    to_category: str | None = None
    amount: float | None = None
    savings: float | None = None
    consequence: str | None = None
    risk_impact: str | None = None


class MaraRequest(BaseModel):
    operation: str = "general_advice"
    prompt: str = ""
    context: dict[str, Any] = Field(default_factory=dict)


class MaraResponse(BaseModel):
    success: bool
    summary: str | None = None
    response: str | None = None
    headline: str | None = None
    advice: str | None = None
    cause: str | None = None
    consequence: str | None = None
    suggested_action: str | None = None
    proposals: list[ProposalSchema] | None = None
    extracted_quote: dict[str, Any] | None = None
    provider: str = "deterministic_mock"


class SimulationRequest(BaseModel):
    event: dict[str, Any]
    guest_delta: int = 0
    catering_variance_pct: float = 0.0


class QuoteParseRequest(BaseModel):
    text: str
