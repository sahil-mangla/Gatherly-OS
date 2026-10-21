"""Database connection, engine configuration, and session management.

Supports PostgreSQL in production via connection pooling and SQLite for frictionless local dev.
"""

import os
from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, declarative_base, sessionmaker

from ..config import settings

Base = declarative_base()


def get_engine_args(url: str) -> dict:
    """Return dialect-specific engine parameters."""
    if url.startswith("sqlite"):
        return {"connect_args": {"check_same_thread": False}}
    return {
        "pool_size": int(os.getenv("DB_POOL_SIZE", "10")),
        "max_overflow": int(os.getenv("DB_MAX_OVERFLOW", "20")),
        "pool_pre_ping": True,
        "pool_recycle": 1800,
    }


engine = create_engine(settings.database_url, **get_engine_args(settings.database_url))
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency yielding database sessions."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    """Initialize database tables and create default tenant/admin if not present."""
    from ..auth.security import hash_password
    from .models import EventModel, Tenant, User

    Base.metadata.create_all(bind=engine)

    with SessionLocal() as session:
        # Check if default tenant exists
        default_tenant = session.query(Tenant).filter_by(id="tenant-default").first()
        if not default_tenant:
            default_tenant = Tenant(
                id="tenant-default",
                name="Gatherly Studio",
                slug="gatherly-studio",
            )
            session.add(default_tenant)

            admin_user = User(
                id="user-admin-1",
                tenant_id="tenant-default",
                email="planner@gatherly.app",
                password_hash=hash_password("gatherly2026"),
                full_name="Maya Lin",
                role="owner",
            )
            session.add(admin_user)

            # Seed default wedding celebration
            wedding_event = EventModel(
                id="wedding-leila-noor",
                tenant_id="tenant-default",
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
            session.add(wedding_event)
            session.commit()
