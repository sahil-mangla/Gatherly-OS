import uuid
from datetime import UTC, datetime

from sqlalchemy import (
    JSON,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
)
from sqlalchemy.orm import relationship

from .database import Base


def utc_now():
    return datetime.now(UTC)


class Tenant(Base):
    """Tenant / Organization entity for multi-tenant data isolation."""

    __tablename__ = "tenants"

    id = Column(String(64), primary_key=True, default=lambda: f"tenant-{uuid.uuid4().hex[:12]}")
    name = Column(String(255), nullable=False)
    slug = Column(String(128), unique=True, nullable=False, index=True)
    created_at = Column(DateTime, default=utc_now, nullable=False)

    users = relationship("User", back_populates="tenant", cascade="all, delete-orphan")
    events = relationship("EventModel", back_populates="tenant", cascade="all, delete-orphan")


class User(Base):
    """User account entity with role-based access control (RBAC)."""

    __tablename__ = "users"

    id = Column(String(64), primary_key=True, default=lambda: f"user-{uuid.uuid4().hex[:12]}")
    tenant_id = Column(String(64), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    email = Column(String(255), nullable=False)
    password_hash = Column(String(255), nullable=False)
    full_name = Column(String(255), nullable=False)
    role = Column(
        String(32), default="planner", nullable=False
    )  # owner, planner, collaborator, vendor
    created_at = Column(DateTime, default=utc_now, nullable=False)

    tenant = relationship("Tenant", back_populates="users")

    __table_args__ = (
        Index("ix_user_tenant_email", "tenant_id", "email", unique=True),
        Index("ix_users_email", "email"),
    )


class EventModel(Base):
    """Event planning entity partitioned by tenant for full data isolation."""

    __tablename__ = "events"

    id = Column(String(64), primary_key=True)
    # No standalone tenant index: ix_events_tenant_created leads with tenant_id.
    tenant_id = Column(String(64), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(255), nullable=False)
    type = Column(String(64), default="wedding", nullable=False)
    date = Column(String(32), nullable=True)
    total_budget = Column(Float, default=0.0, nullable=False)
    expected_guests = Column(Integer, default=0, nullable=False)
    venue_capacity = Column(Integer, default=0, nullable=False)
    theme = Column(String(512), nullable=True)
    state_json = Column(JSON, default=dict, nullable=False)
    created_at = Column(DateTime, default=utc_now, nullable=False)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now, nullable=False)

    tenant = relationship("Tenant", back_populates="events")

    # Serves the per-tenant list ORDER BY created_at DESC and the quota count.
    __table_args__ = (Index("ix_events_tenant_created", "tenant_id", "created_at"),)


class AuditLog(Base):
    """Audit log tracking enterprise data mutations and user compliance."""

    __tablename__ = "audit_logs"

    id = Column(String(64), primary_key=True, default=lambda: f"audit-{uuid.uuid4().hex[:12]}")
    tenant_id = Column(String(64), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(String(64), nullable=True)
    action = Column(String(64), nullable=False)  # create, update, delete, approve_proposal
    resource_type = Column(String(64), nullable=False)
    resource_id = Column(String(64), nullable=False)
    details_json = Column(JSON, default=dict, nullable=False)
    created_at = Column(DateTime, default=utc_now, nullable=False)

    # (tenant_id, created_at) serves per-tenant audit listings and replaces both single indexes.
    __table_args__ = (Index("ix_audit_logs_tenant_created", "tenant_id", "created_at"),)
