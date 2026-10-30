"""FastAPI dependencies for JWT authentication and Role-Based Access Control (RBAC)."""

from typing import Annotated

from fastapi import Depends, HTTPException, Security, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from ..config import settings
from .security import decode_access_token

security_bearer = HTTPBearer(auto_error=False)


class AuthContext:
    """Authenticated context carrying user identity, tenant boundary, and RBAC role."""

    def __init__(self, user_id: str, tenant_id: str, role: str, email: str = ""):
        self.user_id = user_id
        self.tenant_id = tenant_id
        self.role = role
        self.email = email

    def has_role(self, *allowed_roles: str) -> bool:
        """Check if user role matches allowed roles."""
        return self.role in allowed_roles or self.role == "owner"


def _unauthorized(detail: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )


def _guest_context() -> AuthContext:
    return AuthContext(
        user_id="user-demo-guest",
        tenant_id="tenant-default",
        role="owner",
        email="planner@gatherly.app",
    )


def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Security(security_bearer)],
) -> AuthContext:
    """Validate the JWT bearer token and return the authenticated context.

    Missing credentials are rejected (401); the owner-level guest fallback exists only when
    ``settings.allow_guest`` is true (development / test environments).
    """
    if not credentials:
        if settings.allow_guest:
            return _guest_context()
        raise _unauthorized("Authentication required.")

    try:
        payload = decode_access_token(credentials.credentials)
    except ValueError as e:
        raise _unauthorized("Invalid or expired credentials.") from e

    user_id, tenant_id = payload.get("sub"), payload.get("tenant_id")
    if not user_id or not tenant_id:
        raise _unauthorized("Invalid or expired credentials.")
    return AuthContext(user_id, tenant_id, payload["role"], payload.get("email", ""))


def require_role(*allowed_roles: str):
    """Factory creating dependency to enforce RBAC permissions."""

    def role_checker(auth: Annotated[AuthContext, Depends(get_current_user)]) -> AuthContext:
        if not auth.has_role(*allowed_roles):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Forbidden: insufficient permissions for this operation.",
            )
        return auth

    return role_checker
