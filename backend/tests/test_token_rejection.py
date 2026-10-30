"""Forged, expired and malformed tokens are rejected; tenant boundaries never leak."""

from datetime import UTC, datetime, timedelta

import jwt
import pytest

from app.auth.security import JWT_ISSUER, create_access_token

from .conftest import TEST_JWT_SECRET

INVALID = {"detail": "Invalid or expired credentials."}


def claims(**overrides):
    now = datetime.now(UTC)
    base = {
        "sub": "u-1",
        "tenant_id": "tenant-x",
        "role": "owner",
        "iat": now,
        "exp": now + timedelta(minutes=5),
        "iss": JWT_ISSUER,
    }
    return {k: v for k, v in {**base, **overrides}.items() if v is not None}


def signed(payload, secret=TEST_JWT_SECRET, algorithm="HS256"):
    return jwt.encode(payload, secret, algorithm=algorithm)


def without(*names):
    return dict.fromkeys(names)


def tampered():
    head, _, sig = signed(claims()).split(".")
    forged = signed(claims(role="owner", sub="attacker")).split(".")[1]
    return f"{head}.{forged}.{sig}"


TOKENS = {
    "garbage": lambda: "not-a-jwt",
    "three_empty_parts": lambda: "a.b.c",
    "expired": lambda: create_access_token("u", "t", expires_delta=timedelta(seconds=-30)),
    "wrong_secret": lambda: signed(claims(), secret="another-secret-0123456789-abcdefghijklmnopq"),
    "wrong_issuer": lambda: signed(claims(iss="evil-issuer")),
    "missing_issuer": lambda: signed(claims(iss=None)),
    "unknown_role": lambda: signed(claims(role="superadmin")),
    "missing_role": lambda: signed(claims(role=None)),
    "alg_none": lambda: jwt.encode(claims(), None, algorithm="none"),
    "hs512_same_secret": lambda: signed(claims(), algorithm="HS512"),
    "missing_exp": lambda: signed(claims(**without("exp"))),
    "missing_iat": lambda: signed(claims(**without("iat"))),
    "missing_sub": lambda: signed(claims(**without("sub"))),
    "missing_tenant": lambda: signed(claims(**without("tenant_id"))),
    "tampered_payload": tampered,
}


@pytest.fixture(params=["test", "production"])
def any_environment(request, monkeypatch, settings):
    monkeypatch.setattr(settings, "environment", request.param)
    return request.param


@pytest.mark.parametrize("kind", sorted(TOKENS))
@pytest.mark.parametrize("path", ["/api/auth/me", "/api/events"])
def test_bad_tokens_get_a_uniform_401(client, any_environment, kind, path):
    res = client.get(path, headers={"Authorization": f"Bearer {TOKENS[kind]()}"})
    assert res.status_code == 401
    assert res.json() == INVALID
    assert res.headers["www-authenticate"] == "Bearer"


def test_expiry_comes_from_settings(client, monkeypatch, settings):
    monkeypatch.setattr(settings, "jwt_expiration_minutes", -1)
    token = create_access_token("u", "t")
    assert (
        client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"}).status_code == 401
    )


def test_valid_hand_made_token_is_accepted(client):
    res = client.get("/api/auth/me", headers={"Authorization": f"Bearer {signed(claims())}"})
    assert res.status_code == 200 and res.json()["tenant_id"] == "tenant-x"


@pytest.fixture
def two_orgs(client, auth_headers, make_event, second_tenant):
    owner_a = auth_headers("owner")
    event = make_event(owner_a, name="Secret Gala")
    return {"a": owner_a, "b": second_tenant, "event": event}


@pytest.mark.parametrize(
    "method,body", [("GET", None), ("PUT", {"name": "Hacked"}), ("DELETE", None)]
)
def test_cross_tenant_access_is_a_generic_404(client, two_orgs, method, body):
    event = two_orgs["event"]
    res = client.request(
        method, f"/api/events/{event['id']}", headers=two_orgs["b"]["headers"], json=body
    )
    assert res.status_code == 404
    assert res.json() == {"detail": "Event not found."}
    assert event["tenant_id"] not in res.text
    intact = client.get(f"/api/events/{event['id']}", headers=two_orgs["a"]).json()
    assert intact["name"] == "Secret Gala"


def test_tenant_header_cannot_override_the_token_tenant(client, two_orgs):
    event = two_orgs["event"]
    headers = {**two_orgs["b"]["headers"], "X-Tenant-ID": event["tenant_id"]}
    assert client.get(f"/api/events/{event['id']}", headers=headers).status_code == 404
    assert client.get("/api/events", headers=headers).json() == []


def test_event_id_taken_in_another_tenant_is_a_409_without_overwrite(client, two_orgs):
    event = two_orgs["event"]
    res = client.post(
        "/api/events", headers=two_orgs["b"]["headers"], json={"id": event["id"], "name": "Squat"}
    )
    assert res.status_code == 409
    assert res.json() == {"detail": "Event id is already in use."}
    assert event["tenant_id"] not in res.text
    kept = client.get(f"/api/events/{event['id']}", headers=two_orgs["a"]).json()
    assert kept["name"] == "Secret Gala"
    assert client.get("/api/events", headers=two_orgs["b"]["headers"]).json() == []
