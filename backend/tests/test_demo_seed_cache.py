"""ensure_demo_tenant reads the database once per engine URL, thread-safely."""

import threading

from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

from app.db import seed
from app.db.database import Base
from app.db.models import EventModel, Tenant
from app.db.seed import DEMO_TENANT_ID, ensure_demo_tenant, reset_demo_seed_cache


def counting_session(session, monkeypatch):
    reads = []
    original = session.get
    monkeypatch.setattr(session, "get", lambda *a, **k: reads.append(a) or original(*a, **k))
    return reads


def test_repeated_calls_hit_the_database_only_once(db_session, monkeypatch):
    reads = counting_session(db_session, monkeypatch)
    for _ in range(5):
        ensure_demo_tenant(db_session)
    assert len(reads) == 1
    assert db_session.query(Tenant).filter_by(id=DEMO_TENANT_ID).count() == 1


def test_an_already_seeded_database_is_also_remembered(db_session, monkeypatch):
    ensure_demo_tenant(db_session)
    reset_demo_seed_cache()
    reads = counting_session(db_session, monkeypatch)
    ensure_demo_tenant(db_session)
    ensure_demo_tenant(db_session)
    assert len(reads) == 1
    assert db_session.query(EventModel).filter_by(tenant_id=DEMO_TENANT_ID).count() == 1


def test_each_database_is_seeded_independently(fresh_db, tmp_path):
    _, first_factory = fresh_db
    other = create_engine(f"sqlite:///{tmp_path}/other.db")
    Base.metadata.create_all(bind=other)
    try:
        with first_factory() as one, sessionmaker(bind=other)() as two:
            ensure_demo_tenant(one)
            ensure_demo_tenant(two)
            assert one.get(Tenant, DEMO_TENANT_ID) and two.get(Tenant, DEMO_TENANT_ID)
        assert len(seed._demo_seeded) == 2
    finally:
        other.dispose()


def test_reset_forces_a_fresh_read_and_reseeds_a_wiped_database(db_session):
    ensure_demo_tenant(db_session)
    db_session.query(EventModel).delete()
    db_session.query(Tenant).delete()
    db_session.commit()
    ensure_demo_tenant(db_session)  # still remembered, so nothing is re-created
    assert db_session.get(Tenant, DEMO_TENANT_ID) is None
    reset_demo_seed_cache()
    ensure_demo_tenant(db_session)
    assert db_session.get(Tenant, DEMO_TENANT_ID) is not None


def test_concurrent_first_calls_leave_exactly_one_demo_tenant(fresh_db):
    _, factory = fresh_db
    errors = []

    def worker():
        try:
            with factory() as session:
                ensure_demo_tenant(session)
        except Exception as exc:  # pragma: no cover - would fail the assertion below
            errors.append(exc)

    threads = [threading.Thread(target=worker) for _ in range(8)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    with factory() as session:
        assert session.query(Tenant).filter_by(id=DEMO_TENANT_ID).count() == 1
        assert session.query(EventModel).filter_by(tenant_id=DEMO_TENANT_ID).count() == 1
    assert errors == []
    assert len(seed._demo_seeded) == 1


def test_demo_token_endpoint_reads_the_tenant_table_only_once(isolated_client, fresh_db):
    engine, _ = fresh_db
    selects = []

    def record(conn, cursor, statement, *rest):
        if statement.lstrip().upper().startswith("SELECT") and "FROM tenants" in statement:
            selects.append(statement)

    event.listen(engine, "before_cursor_execute", record)
    codes = [isolated_client.get("/api/auth/demo-token").status_code for _ in range(4)]
    assert codes == [200] * 4
    assert len(selects) == 1
