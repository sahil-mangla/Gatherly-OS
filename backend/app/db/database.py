"""Database connection, engine configuration, and session management.

Supports PostgreSQL in production via connection pooling and SQLite for frictionless local dev.
"""

import os
from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, declarative_base, sessionmaker
from sqlalchemy.pool import NullPool, StaticPool

from ..config import settings

Base = declarative_base()


def _is_memory_sqlite(url: str) -> bool:
    return url in ("sqlite://", "sqlite:///:memory:") or ":memory:" in url


def get_engine_args(url: str) -> dict:
    """Return dialect- and platform-specific engine parameters.

    Serverless (Vercel) functions get no pooling: each invocation is short-lived and idle pooled
    connections would only be leaked on freeze. In-memory SQLite shares one connection.
    """
    if url.startswith("sqlite"):
        args: dict = {"connect_args": {"check_same_thread": False}}
        if _is_memory_sqlite(url):
            args["poolclass"] = StaticPool
        elif settings.on_vercel:
            args["poolclass"] = NullPool
        return args
    if settings.on_vercel:
        return {"poolclass": NullPool, "pool_pre_ping": True}
    return {
        "pool_size": int(os.getenv("DB_POOL_SIZE", "5")),
        "max_overflow": int(os.getenv("DB_MAX_OVERFLOW", "5")),
        "pool_pre_ping": True,
        "pool_recycle": 1800,
    }


engine = create_engine(settings.database_url, **get_engine_args(settings.database_url))
# expire_on_commit=False: committed rows stay readable without a refresh round trip per write.
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine, expire_on_commit=False)


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency yielding database sessions."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    """Create tables and seed the default and demo tenants (see ``seed.py`` for the policy)."""
    from .seed import seed_database

    Base.metadata.create_all(bind=engine)
    with SessionLocal() as session:
        seed_database(session)
