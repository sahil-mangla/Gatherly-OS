"""Request schemas for tenant event persistence."""

from typing import Annotated

from pydantic import BaseModel, Field

from .schemas import EventJson, Name

EventId = Annotated[str, Field(pattern=r"^[A-Za-z0-9._-]{1,64}$")]
Money = Annotated[float, Field(ge=0.0, le=1e12)]
Count = Annotated[int, Field(ge=0, le=10_000_000)]


class EventCreateRequest(BaseModel):
    """Body of ``POST /api/events``."""

    id: EventId | None = None
    name: Name = Field(min_length=1)
    type: str = Field(default="wedding", max_length=64)
    date: str | None = Field(default=None, max_length=32)
    total_budget: Money = 0.0
    expected_guests: Count = 0
    venue_capacity: Count = 0
    theme: str | None = Field(default="", max_length=512)
    state_json: EventJson = Field(default_factory=dict)


class EventUpdateRequest(BaseModel):
    """Body of ``PUT /api/events/{id}``; omitted fields stay unchanged."""

    name: Name | None = Field(default=None, min_length=1)
    type: str | None = Field(default=None, max_length=64)
    date: str | None = Field(default=None, max_length=32)
    total_budget: Money | None = None
    expected_guests: Count | None = None
    venue_capacity: Count | None = None
    theme: str | None = Field(default=None, max_length=512)
    state_json: EventJson | None = None
