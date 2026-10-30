"""Event table indexes match the list query: (tenant_id, created_at)."""

from sqlalchemy import inspect

from app.db.models import EventModel


def test_events_are_indexed_by_tenant_and_created_at(fresh_db):
    engine, _ = fresh_db
    indexes = {i["name"]: i["column_names"] for i in inspect(engine).get_indexes("events")}
    assert indexes == {"ix_events_tenant_created": ["tenant_id", "created_at"]}


def test_model_declares_no_unused_tenant_type_index():
    names = {index.name for index in EventModel.__table__.indexes}
    assert names == {"ix_events_tenant_created"}
