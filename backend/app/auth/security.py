"""Cryptographic security utilities for password hashing and JWT token lifecycle."""

import hashlib
import secrets
from datetime import UTC, datetime, timedelta
from typing import Any

import jwt

from ..config import settings


def hash_password(password: str) -> str:
    """Generate salted PBKDF2-HMAC-SHA256 password hash."""
    salt = secrets.token_hex(16)
    key = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt.encode("utf-8"),
        100_000,
    )
    return f"{salt}${key.hex()}"


def verify_password(password: str, hashed: str) -> bool:
    """Verify password against salted PBKDF2 hash using constant-time comparison."""
    try:
        salt, key_hex = hashed.split("$", 1)
        expected_key = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode("utf-8"),
            salt.encode("utf-8"),
            100_000,
        )
        return secrets.compare_digest(expected_key.hex(), key_hex)
    except Exception:
        return False


def create_access_token(
    user_id: str,
    tenant_id: str,
    role: str = "planner",
    expires_delta: timedelta | None = None,
) -> str:
    """Issue a signed JWT access token containing tenant and RBAC claims."""
    now = datetime.now(UTC)
    expire = now + (expires_delta or timedelta(minutes=settings.jwt_expiration_minutes))

    payload: dict[str, Any] = {
        "sub": user_id,
        "tenant_id": tenant_id,
        "role": role,
        "iat": now,
        "exp": expire,
        "iss": "gatherly-auth-service",
    }

    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> dict[str, Any]:
    """Decode and cryptographically verify a JWT access token."""
    try:
        return jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=[settings.jwt_algorithm],
            issuer="gatherly-auth-service",
        )
    except jwt.PyJWTError as e:
        raise ValueError(f"Invalid or expired JWT token: {e}") from e
