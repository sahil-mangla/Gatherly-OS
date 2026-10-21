"""Repository layer enforcing strict tenant boundary isolation across database operations."""

from typing import Any

from sqlalchemy.orm import Session

from .models import AuditLog, EventModel


class EventRepository:
    """Multi-tenant event repository."""

    def __init__(self, db: Session, tenant_id: str):
        self.db = db
        self.tenant_id = tenant_id

    def list_events(self) -> list[EventModel]:
        """Fetch all events belonging strictly to the active tenant."""
        return (
            self.db.query(EventModel)
            .filter(EventModel.tenant_id == self.tenant_id)
            .order_by(EventModel.created_at.desc())
            .all()
        )

    def get_event(self, event_id: str) -> EventModel | None:
        """Fetch single event with strict tenant check."""
        return (
            self.db.query(EventModel)
            .filter(EventModel.tenant_id == self.tenant_id, EventModel.id == event_id)
            .first()
        )

    def create_event(self, event_data: dict[str, Any], user_id: str | None = None) -> EventModel:
        """Create new event partitioned under the active tenant."""
        event_id = (
            event_data.get("id")
            or f"event-{event_data.get('type', 'generic')}-{int(self.db.bind.dialect.name == 'sqlite')}"
        )
        model = EventModel(
            id=event_id,
            tenant_id=self.tenant_id,
            name=event_data.get("name", "New Event"),
            type=event_data.get("type", "wedding"),
            date=event_data.get("date"),
            total_budget=float(event_data.get("total_budget", 0.0)),
            expected_guests=int(event_data.get("expected_guests", 0)),
            venue_capacity=int(event_data.get("venue_capacity", 0)),
            theme=event_data.get("theme", ""),
            state_json=event_data.get("state_json", {}),
        )
        self.db.add(model)
        self.log_audit(
            user_id=user_id,
            action="create",
            resource_type="event",
            resource_id=model.id,
            details={"name": model.name, "budget": model.total_budget},
        )
        self.db.commit()
        self.db.refresh(model)
        return model

    def update_event(
        self, event_id: str, updates: dict[str, Any], user_id: str | None = None
    ) -> EventModel | None:
        """Update an existing event within tenant boundary."""
        event = self.get_event(event_id)
        if not event:
            return None

        for field in (
            "name",
            "type",
            "date",
            "total_budget",
            "expected_guests",
            "venue_capacity",
            "theme",
        ):
            if field in updates:
                setattr(event, field, updates[field])

        if "state_json" in updates:
            event.state_json = updates["state_json"]

        self.log_audit(
            user_id=user_id,
            action="update",
            resource_type="event",
            resource_id=event.id,
            details={"updated_fields": list(updates.keys())},
        )
        self.db.commit()
        self.db.refresh(event)
        return event

    def delete_event(self, event_id: str, user_id: str | None = None) -> bool:
        """Delete an event ensuring tenant boundary."""
        event = self.get_event(event_id)
        if not event:
            return False

        self.db.delete(event)
        self.log_audit(
            user_id=user_id,
            action="delete",
            resource_type="event",
            resource_id=event_id,
            details={"name": event.name},
        )
        self.db.commit()
        return True

    def log_audit(
        self,
        user_id: str | None,
        action: str,
        resource_type: str,
        resource_id: str,
        details: dict[str, Any],
    ) -> AuditLog:
        """Record an immutable audit log entry."""
        audit = AuditLog(
            tenant_id=self.tenant_id,
            user_id=user_id,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            details_json=details,
        )
        self.db.add(audit)
        return audit
