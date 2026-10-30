"""Cryptographic security utilities for password hashing and JWT token lifecycle."""

import functools
import hashlib
import logging
import secrets
from datetime import UTC, datetime, timedelta
from typing import Any

import jwt

from ..config import settings

logger = logging.getLogger("gatherly.auth")

JWT_ALGORITHMS = ["HS256"]
JWT_ISSUER = "gatherly-auth-service"
VALID_ROLES = frozenset({"owner", "planner", "collaborator", "vendor"})
HASH_SCHEME = "pbkdf2_sha256"
LEGACY_ITERATIONS = 100_000  # hashes stored as "salt$hex" predate the iteration-count prefix
MAX_ITERATIONS = 5_000_000


def _derive(password: str, salt: str, iterations: int) -> str:
    key = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), iterations)
    return key.hex()


def hash_password(password: str) -> str:
    """Generate a salted PBKDF2-HMAC-SHA256 hash: ``pbkdf2_sha256$iterations$salt$hex``."""
    salt = secrets.token_hex(16)
    iterations = settings.password_hash_iterations
    return f"{HASH_SCHEME}${iterations}${salt}${_derive(password, salt, iterations)}"


def _parse_hash(hashed: str) -> tuple[int, str, str]:
    """Split a stored hash into (iterations, salt, key_hex); legacy ``salt$hex`` is supported."""
    parts = hashed.split("$")
    if len(parts) == 4 and parts[0] == HASH_SCHEME:
        return int(parts[1]), parts[2], parts[3]
    salt, key_hex = hashed.split("$", 1)
    return LEGACY_ITERATIONS, salt, key_hex


def verify_password(password: str, hashed: str) -> bool:
    """Verify password against a stored PBKDF2 hash using constant-time comparison."""
    try:
        iterations, salt, key_hex = _parse_hash(hashed)
    except ValueError:
        return False
    if not 0 < iterations <= MAX_ITERATIONS:
        return False
    return secrets.compare_digest(_derive(password, salt, iterations), key_hex)


@functools.cache
def _dummy_hash() -> str:
    return hash_password(secrets.token_hex(8))


def burn_password_check(password: str) -> None:
    """Spend the same CPU as a real verification so unknown emails are not distinguishable."""
    verify_password(password, _dummy_hash())


def create_access_token(
    user_id: str,
    tenant_id: str,
    role: str = "planner",
    expires_delta: timedelta | None = None,
    demo: bool = False,
) -> str:
    """Issue a signed JWT access token containing tenant and RBAC claims.

    ``demo=True`` marks a shared-sandbox session: it carries a ``demo`` claim that makes the
    session read-only for event mutations.
    """
    if role not in VALID_ROLES:
        raise ValueError("Unknown role.")
    now = datetime.now(UTC)
    expire = now + (expires_delta or timedelta(minutes=settings.jwt_expiration_minutes))

    payload: dict[str, Any] = {
        "sub": user_id,
        "tenant_id": tenant_id,
        "role": role,
        "iat": now,
        "exp": expire,
        "iss": JWT_ISSUER,
    }
    if demo:
        payload["demo"] = True

    return jwt.encode(payload, settings.jwt_secret, algorithm=JWT_ALGORITHMS[0])


def decode_access_token(token: str) -> dict[str, Any]:
    """Decode and verify a JWT: HS256 only, signature, issuer and exp/iat/sub are required."""
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=JWT_ALGORITHMS,
            issuer=JWT_ISSUER,
            options={"require": ["exp", "iat", "sub"]},
        )
    except jwt.PyJWTError as e:
        logger.debug("Rejected JWT: %s", type(e).__name__)
        raise ValueError("Invalid or expired token.") from e
    if payload.get("role") not in VALID_ROLES or not isinstance(payload.get("demo", False), bool):
        raise ValueError("Invalid or expired token.")
    return payload
