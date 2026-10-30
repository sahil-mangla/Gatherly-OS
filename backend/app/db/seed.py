"""Idempotent seed data: the default studio tenant and the isolated public demo tenant."""

import logging
import threading

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..auth.security import hash_password
from ..config import settings
from .models import EventModel, Tenant, User

logger = logging.getLogger("gatherly.db")

DEFAULT_TENANT_ID = "tenant-default"
DEMO_TENANT_ID = "tenant-demo"
DEV_ADMIN_PASSWORD = "gatherly2026"  # development/test convenience only, never seeded in prod


def _wedding_event(event_id: str, tenant_id: str) -> EventModel:
    """The seeded demo wedding celebration."""
    return EventModel(
        id=event_id,
        tenant_id=tenant_id,
        name="Leila & Noor",
        type="wedding",
        date="2025-09-14",
        total_budget=24000.0,
        expected_guests=150,
        venue_capacity=140,
        theme="Effortless, intimate, a little bit unexpected",
        state_json={
            "currency": "$",
            "color_accent": "coral",
            "expenses": [
                {
                    "id": "exp-venue-deposit",
                    "category": "venue",
                    "description": "Venue rental deposit",
                    "planned_amount": 9600,
                    "actual_amount": 4800,
                    "committed_amount": 4800,
                    "status": "paid",
                }
            ],
        },
    )


def _commit_once(session: Session) -> None:
    """Commit seed rows; a concurrent worker seeding the same rows is not an error."""
    try:
        session.commit()
    except IntegrityError:
        session.rollback()
        logger.info("Seed rows already created by another worker.")


# Databases (by URL) known to hold the demo tenant, so demo-token calls skip the existence read.
_demo_seeded: set[str] = set()
_demo_lock = threading.Lock()


def reset_demo_seed_cache() -> None:
    """Forget which databases are seeded (tests and database swaps)."""
    with _demo_lock:
        _demo_seeded.clear()


def ensure_demo_tenant(session: Session) -> None:
    """Create the isolated demo tenant (no users, no credentials) with a sample wedding."""
    db_key = session.get_bind().url.render_as_string(hide_password=True)
    with _demo_lock:
        if db_key in _demo_seeded:
            return
    if not session.get(Tenant, DEMO_TENANT_ID):
        session.add(Tenant(id=DEMO_TENANT_ID, name="Gatherly Demo", slug="gatherly-demo"))
        session.add(_wedding_event("demo-wedding-leila-noor", DEMO_TENANT_ID))
        _commit_once(session)
    with _demo_lock:
        _demo_seeded.add(db_key)


def _seed_default_tenant(session: Session) -> None:
    """Seed the studio tenant. Production seeds it only when SEED_ADMIN_PASSWORD is provided."""
    password = settings.seed_admin_password
    if not password and not settings.is_production:
        password = DEV_ADMIN_PASSWORD
    if not password or session.get(Tenant, DEFAULT_TENANT_ID):
        return
    session.add(Tenant(id=DEFAULT_TENANT_ID, name="Gatherly Studio", slug="gatherly-studio"))
    session.add(
        User(
            id="user-admin-1",
            tenant_id=DEFAULT_TENANT_ID,
            email="planner@gatherly.app",
            password_hash=hash_password(password),
            full_name="Maya Lin",
            role="owner",
        )
    )
    session.add(_wedding_event("wedding-leila-noor", DEFAULT_TENANT_ID))
    _commit_once(session)


def seed_database(session: Session) -> None:
    """Seed tenants according to environment policy."""
    _seed_default_tenant(session)
    if settings.demo_mode:
        ensure_demo_tenant(session)
