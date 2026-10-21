"""Integration tests for FastAPI endpoints."""

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_check_endpoint():
    resp = client.get("/api/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert data["service"] == "gatherly-backend"


def test_mara_cost_saving_endpoint():
    resp = client.post(
        "/api/mara",
        json={
            "operation": "cost_saving_proposals",
            "prompt": "Show me smart ways to save",
            "context": {
                "event": {"name": "Test Wedding"},
                "budget": {"total_budget": 24000, "remaining_uncommitted": 5540},
            },
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is True
    assert len(data["proposals"]) > 0
    assert data["proposals"][0]["action"] in ["reallocate", "update_expense", "custom"]


def test_simulate_endpoint():
    resp = client.post(
        "/api/simulate",
        json={
            "event": {
                "total_budget": 20000,
                "expected_guests": 100,
                "venue_capacity": 110,
                "expenses": [],
                "tasks": [],
            },
            "guest_delta": 20,
            "catering_variance_pct": 5.0,
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["projected"]["guests"] == 120
    assert data["projected"]["capacity_breach"] is True


def test_vendor_parse_seed_endpoint():
    resp = client.post(
        "/api/vendors/parse-seed",
        json={"text": "Photography package $2,500 with $750 deposit. 8 hours coverage."},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is True
    assert data["extracted_quote"]["quoted_base_amount"] == 2500.0
