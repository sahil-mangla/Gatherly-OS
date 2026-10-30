"""Password hashing formats and JWT issuance/verification rules."""

import hashlib
import re
from datetime import timedelta

import jwt
import pytest

from app.auth import security
from app.auth.security import (
    JWT_ISSUER,
    create_access_token,
    decode_access_token,
    hash_password,
    verify_password,
)

from .conftest import ROLES, TEST_JWT_SECRET


def legacy_hash(password, salt="abcd1234"):
    key = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 100_000)
    return f"{salt}${key.hex()}"


def test_new_hashes_use_the_versioned_pbkdf2_format(settings, monkeypatch):
    monkeypatch.setattr(settings, "password_hash_iterations", 4321)
    assert re.fullmatch(
        r"pbkdf2_sha256\$4321\$[0-9a-f]{32}\$[0-9a-f]{64}", hash_password("pw-12345")
    )


def test_hashes_are_salted_per_call():
    assert hash_password("same-password") != hash_password("same-password")


def test_hash_verifies_with_the_iterations_it_was_created_with(settings, monkeypatch):
    monkeypatch.setattr(settings, "password_hash_iterations", 1500)
    stored = hash_password("rotate-me-1")
    monkeypatch.setattr(settings, "password_hash_iterations", 2500)
    assert verify_password("rotate-me-1", stored) is True


def test_legacy_salt_hex_hashes_still_verify():
    stored = legacy_hash("old-password")
    assert verify_password("old-password", stored) is True
    assert verify_password("other-password", stored) is False


@pytest.mark.parametrize(
    "stored",
    [
        "",
        "no-dollar-sign",
        "pbkdf2_sha256$abc$salt$deadbeef",
        "pbkdf2_sha256$0$salt$deadbeef",
        "pbkdf2_sha256$-5$salt$deadbeef",
        "pbkdf2_sha256$5000001$salt$deadbeef",
    ],
)
def test_malformed_or_abusive_hashes_fail_closed(stored):
    assert verify_password("anything", stored) is False


def test_wrong_password_and_empty_password_fail():
    stored = hash_password("correct horse")
    assert verify_password("correct horsf", stored) is False
    assert verify_password("", stored) is False


def test_burn_check_runs_a_real_verification(monkeypatch):
    calls = []
    monkeypatch.setattr(security, "verify_password", lambda pw, h: calls.append((pw, h)) or False)
    security.burn_password_check("probe")
    assert calls[0][0] == "probe" and calls[0][1].startswith("pbkdf2_sha256$")


@pytest.mark.parametrize("role", ROLES)
def test_token_roundtrip_for_each_role(role):
    claims = decode_access_token(create_access_token("u-1", "t-1", role=role))
    assert (claims["sub"], claims["tenant_id"], claims["role"], claims["iss"]) == (
        "u-1",
        "t-1",
        role,
        JWT_ISSUER,
    )


def test_issuing_a_token_for_an_unknown_role_is_refused():
    with pytest.raises(ValueError, match="Unknown role"):
        create_access_token("u", "t", role="admin")


def test_tokens_are_hs256_signed_with_the_configured_secret():
    token = create_access_token("u", "t")
    assert jwt.get_unverified_header(token)["alg"] == "HS256"
    assert jwt.decode(token, TEST_JWT_SECRET, algorithms=["HS256"], issuer=JWT_ISSUER)["sub"] == "u"


def test_lifetime_defaults_to_configured_minutes_and_can_be_overridden(settings, monkeypatch):
    monkeypatch.setattr(settings, "jwt_expiration_minutes", 30)
    default = decode_access_token(create_access_token("u", "t"))
    short = decode_access_token(create_access_token("u", "t", expires_delta=timedelta(minutes=2)))
    assert default["exp"] - default["iat"] == 30 * 60
    assert short["exp"] - short["iat"] == 120


@pytest.mark.parametrize("claim", ["exp", "iat", "sub"])
def test_required_claims_must_be_present(claim):
    payload = jwt.decode(
        create_access_token("u", "t"), TEST_JWT_SECRET, algorithms=["HS256"], issuer=JWT_ISSUER
    )
    del payload[claim]
    with pytest.raises(ValueError, match="Invalid or expired token"):
        decode_access_token(jwt.encode(payload, TEST_JWT_SECRET, algorithm="HS256"))


def test_expired_tokens_and_non_tokens_raise_one_generic_error():
    expired = create_access_token("u", "t", expires_delta=timedelta(seconds=-1))
    for token in (expired, "garbage", ""):
        with pytest.raises(ValueError, match="^Invalid or expired token.$"):
            decode_access_token(token)


@pytest.mark.parametrize("algorithm", ["HS384", "HS512"])
def test_other_hmac_algorithms_are_refused(algorithm):
    payload = jwt.decode(
        create_access_token("u", "t"), TEST_JWT_SECRET, algorithms=["HS256"], issuer=JWT_ISSUER
    )
    with pytest.raises(ValueError):
        decode_access_token(jwt.encode(payload, TEST_JWT_SECRET, algorithm=algorithm))
