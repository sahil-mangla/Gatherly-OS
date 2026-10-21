"""FastAPI dependencies for JWT authentication and Role-Based Access Control (RBAC)."""

from typing import Annotated

from fastapi import Depends, HTTPException, Security, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from ..db.database import get_db
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


def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Security(security_bearer)],
    db: Annotated[Session, Depends(get_db)],
) -> AuthContext:
    """Validate JWT bearer token and retrieve authenticated context.

    Falls back to default demo planner if no token is passed (enables friction-free local dev).
    """
    if not credentials:
        # Demo / Guest mode fallback
        return AuthContext(
            user_id="user-demo-guest",
            tenant_id="tenant-default",
            role="owner",
            email="planner@gatherly.app",
        )

    token = credentials.credentials
    try:
        payload = decode_access_token(token)
        user_id = payload.get("sub")
        tenant_id = payload.get("tenant_id")
        role = payload.get("role", "planner")

        if not user_id or not tenant_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Malformed token claims.",
            )

        return AuthContext(
            user_id=user_id,
            tenant_id=tenant_id,
            role=role,
            email=payload.get("email", ""),
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(e),
            headers={"WWW-Authenticate": "Bearer"},
        ) from e


def require_role(*allowed_roles: str):
    """Factory creating dependency to enforce RBAC permissions."""

    def role_checker(
        auth: Annotated[AuthContext, Depends(get_current_user)]
    ) -> AuthContext:
        if not auth.has_role(*allowed_roles):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Forbidden: role '{auth.role}' lacks permission for this operation. Required: {allowed_roles}",
            )
        return auth

    return role_checker
