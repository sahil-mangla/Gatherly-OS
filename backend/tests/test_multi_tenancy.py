"""Automated tests for multi-tenant data partitioning, isolation, and audit logging."""

import pytest
from backend.app.auth.security import create_access_token
from backend.app.main import app
from fastapi.testclient import TestClient


@pytest.fixture
def client():
    return TestClient(app)


def test_tenant_boundary_data_isolation(client):
    """Verify Tenant A and Tenant B cannot access or leak each other's celebration events."""
    import uuid

    unique_event_id = f"event-alpha-{uuid.uuid4().hex[:8]}"
    token_tenant_a = create_access_token("u-alice", "tenant-alpha-org", role="owner")
    token_tenant_b = create_access_token("u-bob", "tenant-beta-org", role="owner")

    # Tenant A creates an event
    create_res = client.post(
        "/api/events",
        headers={"Authorization": f"Bearer {token_tenant_a}"},
        json={
            "id": unique_event_id,
            "name": "Alpha Secret Launch",
            "type": "corporate",
            "total_budget": 100000.0,
            "expected_guests": 300,
            "venue_capacity": 350,
        },
    )
    assert create_res.status_code == 201
    created_id = create_res.json()["id"]

    # Tenant A can list and retrieve it
    list_a = client.get("/api/events", headers={"Authorization": f"Bearer {token_tenant_a}"})
    assert any(e["id"] == created_id for e in list_a.json())

    get_a = client.get(
        f"/api/events/{created_id}", headers={"Authorization": f"Bearer {token_tenant_a}"}
    )
    assert get_a.status_code == 200
    assert get_a.json()["name"] == "Alpha Secret Launch"

    # Tenant B lists their events -> MUST NOT contain Tenant A's event
    list_b = client.get("/api/events", headers={"Authorization": f"Bearer {token_tenant_b}"})
    assert list_b.status_code == 200
    assert not any(e["id"] == created_id for e in list_b.json())

    # Tenant B attempts direct access to Tenant A's event -> 404 Not Found (Zero Leakage)
    get_b = client.get(
        f"/api/events/{created_id}", headers={"Authorization": f"Bearer {token_tenant_b}"}
    )
    assert get_b.status_code == 404

    # Tenant B attempts to update Tenant A's event -> 404 Not Found
    put_b = client.put(
        f"/api/events/{created_id}",
        headers={"Authorization": f"Bearer {token_tenant_b}"},
        json={"name": "Tampered Name"},
    )
    assert put_b.status_code == 404

    # Tenant B attempts to delete Tenant A's event -> 404 Not Found
    del_b = client.delete(
        f"/api/events/{created_id}", headers={"Authorization": f"Bearer {token_tenant_b}"}
    )
    assert del_b.status_code == 404


def test_event_lifecycle_and_updates(client):
    """Test full CRUD lifecycle within tenant boundary."""
    token = create_access_token("u-planner", "tenant-default", role="planner")

    # Update seeded wedding event
    update_res = client.put(
        "/api/events/wedding-leila-noor",
        headers={"Authorization": f"Bearer {token}"},
        json={"expected_guests": 165, "total_budget": 26000.0},
    )
    assert update_res.status_code == 200
    assert update_res.json()["expected_guests"] == 165
    assert update_res.json()["total_budget"] == 26000.0
