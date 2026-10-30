"""Multi-tenant event persistence and lifecycle endpoints."""

from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from ..auth.dependencies import AuthContext, get_current_user, require_role
from ..db.database import get_db
from ..db.repository import (
    DEFAULT_PAGE_SIZE,
    MAX_PAGE_SIZE,
    EventLimitError,
    EventRepository,
)
from .event_schemas import EventCreateRequest, EventUpdateRequest

router = APIRouter(prefix="/api/events", tags=["Multi-Tenant Events"])

NOT_FOUND = "Event not found."
LIMIT_REACHED = "Event limit reached for this organization."
NULLABLE_FIELDS = ("date", "theme")


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


def _clean_updates(req: EventUpdateRequest) -> dict[str, Any]:
    """Explicit nulls are only meaningful for nullable columns; drop them elsewhere."""
    sent = req.model_dump(exclude_unset=True)
    return {k: v for k, v in sent.items() if v is not None or k in NULLABLE_FIELDS}


@router.get("")
def list_events(
    auth: Annotated[AuthContext, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    limit: Annotated[int, Query(ge=1, le=MAX_PAGE_SIZE)] = DEFAULT_PAGE_SIZE,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> list[dict[str, Any]]:
    """List events scoped to the authenticated tenant (paged; optional limit/offset)."""
    repo = EventRepository(db, auth.tenant_id)
    events = repo.sync_schedules(repo.list_events(limit, offset), user_id=auth.user_id)
    return [_format_event_response(e) for e in events]


@router.get("/{event_id}")
def get_event(
    event_id: str,
    auth: Annotated[AuthContext, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> dict[str, Any]:
    """Retrieve event details enforcing tenant boundary."""
    repo = EventRepository(db, auth.tenant_id)
    event = repo.get_event(event_id)
    if not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=NOT_FOUND)
    return _format_event_response(repo.sync_schedule(event, user_id=auth.user_id))


@router.post("", status_code=status.HTTP_201_CREATED)
def create_event(
    req: EventCreateRequest,
    auth: Annotated[AuthContext, Depends(require_role("owner", "planner", mutating=True))],
    db: Annotated[Session, Depends(get_db)],
) -> dict[str, Any]:
    """Create an event in the authenticated tenant (server-generated id; 409 at the quota)."""
    repo = EventRepository(db, auth.tenant_id)
    try:
        # A client-supplied ``id`` is accepted for compatibility but always ignored.
        created = repo.create_event(req.model_dump(exclude={"id"}), user_id=auth.user_id)
    except EventLimitError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=LIMIT_REACHED) from exc
    return _format_event_response(repo.sync_schedule(created, user_id=auth.user_id))


@router.put("/{event_id}")
def update_event(
    event_id: str,
    req: EventUpdateRequest,
    auth: Annotated[
        AuthContext, Depends(require_role("owner", "planner", "collaborator", mutating=True))
    ],
    db: Annotated[Session, Depends(get_db)],
) -> dict[str, Any]:
    """Update event data within the tenant boundary."""
    repo = EventRepository(db, auth.tenant_id)
    updates = _clean_updates(req)
    updated = repo.update_event(event_id, updates, user_id=auth.user_id)
    if not updated:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=NOT_FOUND)
    return _format_event_response(repo.sync_schedule(updated, user_id=auth.user_id))


@router.delete("/{event_id}")
def delete_event(
    event_id: str,
    auth: Annotated[AuthContext, Depends(require_role("owner", mutating=True))],
    db: Annotated[Session, Depends(get_db)],
) -> dict[str, Any]:
    """Delete an event (requires administrative 'owner' RBAC role)."""
    repo = EventRepository(db, auth.tenant_id)
    if not repo.delete_event(event_id, user_id=auth.user_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=NOT_FOUND)
    return {"success": True, "deleted_id": event_id}
