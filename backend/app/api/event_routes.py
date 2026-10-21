"""Multi-tenant event persistence and lifecycle endpoints."""

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..auth.dependencies import AuthContext, get_current_user, require_role
from ..db.database import get_db
from ..db.repository import EventRepository

router = APIRouter(prefix="/api/events", tags=["Multi-Tenant Events"])


class EventCreateRequest(BaseModel):
    id: str | None = None
    name: str = Field(..., min_length=1, max_length=200)
    type: str = "wedding"
    date: str | None = None
    total_budget: float = 0.0
    expected_guests: int = 0
    venue_capacity: int = 0
    theme: str | None = ""
    state_json: dict[str, Any] = Field(default_factory=dict)


class EventUpdateRequest(BaseModel):
    name: str | None = None
    type: str | None = None
    date: str | None = None
    total_budget: float | None = None
    expected_guests: int | None = None
    venue_capacity: int | None = None
    theme: str | None = None
    state_json: dict[str, Any] | None = None


def _format_event_response(event) -> dict[str, Any]:
    return {
        "id": event.id,
        "tenant_id": event.tenant_id,
        "name": event.name,
        "type": event.type,
        "date": event.date,
        "total_budget": event.total_budget,
        "expected_guests": event.expected_guests,
        "venue_capacity": event.venue_capacity,
        "theme": event.theme,
        "state_json": event.state_json,
        "created_at": event.created_at.isoformat() if event.created_at else None,
        "updated_at": event.updated_at.isoformat() if event.updated_at else None,
    }


@router.get("")
def list_events(
    auth: AuthContext = Depends(get_current_user), db: Session = Depends(get_db)
) -> list[dict[str, Any]]:
    """List all events scoped to the authenticated tenant."""
    repo = EventRepository(db, auth.tenant_id)
    events = repo.list_events()
    return [_format_event_response(e) for e in events]


@router.get("/{event_id}")
def get_event(
    event_id: str,
    auth: AuthContext = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Retrieve event details enforcing tenant boundary."""
    repo = EventRepository(db, auth.tenant_id)
    event = repo.get_event(event_id)
    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Event '{event_id}' not found for tenant '{auth.tenant_id}'.",
        )
    return _format_event_response(event)


@router.post("", status_code=status.HTTP_201_CREATED)
def create_event(
    req: EventCreateRequest,
    auth: AuthContext = Depends(require_role("owner", "planner")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Create a new event within the authenticated tenant."""
    repo = EventRepository(db, auth.tenant_id)
    created = repo.create_event(req.model_dump(), user_id=auth.user_id)
    return _format_event_response(created)


@router.put("/{event_id}")
def update_event(
    event_id: str,
    req: EventUpdateRequest,
    auth: AuthContext = Depends(require_role("owner", "planner", "collaborator")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Update event data within the tenant boundary."""
    repo = EventRepository(db, auth.tenant_id)
    updates = req.model_dump(exclude_unset=True)
    updated = repo.update_event(event_id, updates, user_id=auth.user_id)
    if not updated:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Event '{event_id}' not found for tenant '{auth.tenant_id}'.",
        )
    return _format_event_response(updated)


@router.delete("/{event_id}")
def delete_event(
    event_id: str,
    auth: AuthContext = Depends(require_role("owner")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Delete an event (requires administrative 'owner' RBAC role)."""
    repo = EventRepository(db, auth.tenant_id)
    success = repo.delete_event(event_id, user_id=auth.user_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Event '{event_id}' not found for tenant '{auth.tenant_id}'.",
        )
    return {"success": True, "deleted_id": event_id}
