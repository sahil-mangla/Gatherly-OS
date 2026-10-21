"""Automated tests for JWT authentication, cryptographic hashing, and RBAC authorization."""

import pytest
from backend.app.auth.security import (
    create_access_token,
    decode_access_token,
    hash_password,
    verify_password,
)
from backend.app.main import app
from fastapi.testclient import TestClient


@pytest.fixture
def client():
    return TestClient(app)


def test_password_hashing_and_verification():
    """Verify PBKDF2-HMAC-SHA256 password hashing and validation."""
    pwd = "super-secret-password-123"
    hashed = hash_password(pwd)
    assert hashed != pwd
    assert "$" in hashed
    assert verify_password(pwd, hashed) is True
    assert verify_password("wrong-password", hashed) is False


def test_jwt_token_lifecycle():
    """Verify signed JWT token issuance, claims embedding, and verification."""
    token = create_access_token(user_id="user-42", tenant_id="tenant-acme", role="planner")
    payload = decode_access_token(token)
    assert payload["sub"] == "user-42"
    assert payload["tenant_id"] == "tenant-acme"
    assert payload["role"] == "planner"
    assert payload["iss"] == "gatherly-auth-service"


def test_auth_registration_and_login_flow(client):
    """Test full multi-tenant registration and login loop."""
    import uuid

    uid = uuid.uuid4().hex[:8]
    unique_email = f"elena-{uid}@lumina.example.com"
    reg_payload = {
        "organization_name": f"Lumina Events {uid[:6]}",
        "full_name": "Elena Rostova",
        "email": unique_email,
        "password": "strongPassword!2026",
    }
    # Register
    res = client.post("/api/auth/register", json=reg_payload)
    assert res.status_code == 200
    data = res.json()
    assert "access_token" in data
    assert data["role"] == "owner"
    token = data["access_token"]

    # Profile check with Bearer token
    me_res = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me_res.status_code == 200
    me_data = me_res.json()
    assert me_data["tenant_id"] == data["tenant_id"]
    assert me_data["role"] == "owner"

    # Login
    login_res = client.post(
        "/api/auth/login",
        json={"email": unique_email, "password": "strongPassword!2026"},
    )
    assert login_res.status_code == 200
    assert "access_token" in login_res.json()

    # Reject invalid password
    bad_login = client.post(
        "/api/auth/login",
        json={"email": unique_email, "password": "wrongPassword"},
    )
    assert bad_login.status_code == 401


def test_rbac_endpoint_protection(client):
    """Test that unauthorized roles cannot execute restricted operations."""
    # Issue a vendor-role token
    vendor_token = create_access_token(
        user_id="u-vendor", tenant_id="tenant-default", role="vendor"
    )

    # Creating an event requires owner or planner role
    res = client.post(
        "/api/events",
        headers={"Authorization": f"Bearer {vendor_token}"},
        json={"name": "Unauthorized Gala", "type": "gala", "total_budget": 50000},
    )
    assert res.status_code == 403
    assert "Forbidden" in res.json()["detail"]
