"""Fixtures giving tests an empty, isolated SQLite database."""

from datetime import UTC, datetime, timedelta

import pytest


@pytest.fixture
def fresh_db(tmp_path):
    """An empty, isolated SQLite database: ``(engine, sessionmaker)`` with all tables created."""
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker

    from app.db import models  # noqa: F401  (register tables on Base)
    from app.db.database import Base

    engine = create_engine(
        f"sqlite:///{tmp_path}/fresh.db", connect_args={"check_same_thread": False}
    )
    Base.metadata.create_all(bind=engine)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    yield engine, factory
    engine.dispose()


@pytest.fixture
def db_session(fresh_db):
    _, factory = fresh_db
    with factory() as session:
        yield session


@pytest.fixture
def isolated_client(asgi_app, fresh_db):
    """TestClient whose requests use the fresh database instead of the shared session one."""
    from fastapi.testclient import TestClient

    from app.db.database import get_db

    _, factory = fresh_db

    def override():
        with factory() as session:
            yield session

    asgi_app.dependency_overrides[get_db] = override
    yield TestClient(asgi_app)
    asgi_app.dependency_overrides.pop(get_db, None)


def seed_events(session, tenant, count):
    """Insert ``count`` events whose created_at strictly increases with their index."""
    from app.db.models import EventModel

    start = datetime(2026, 1, 1, tzinfo=UTC)
    session.add_all(
        EventModel(
            id=f"{tenant}-e{i:04d}",
            tenant_id=tenant,
            name=f"E{i}",
            created_at=start + timedelta(minutes=i),
            updated_at=start,
        )
        for i in range(count)
    )
    session.commit()
