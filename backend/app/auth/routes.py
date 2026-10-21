import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session

from ..db.database import get_db
from ..db.models import Tenant, User
from .dependencies import AuthContext, get_current_user
from .security import create_access_token, hash_password, verify_password

router = APIRouter(prefix="/api/auth", tags=["Authentication & Multi-Tenancy"])


class RegisterRequest(BaseModel):
    organization_name: str = Field(..., min_length=2, max_length=120)
    full_name: str = Field(..., min_length=2, max_length=120)
    email: EmailStr
    password: str = Field(..., min_length=6)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class AuthTokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    tenant_id: str
    user_id: str
    role: str
    email: str


@router.post("/register", response_model=AuthTokenResponse)
def register_organization(req: RegisterRequest, db: Session = Depends(get_db)) -> Any:
    """Register a new multi-tenant organization with an administrative owner."""
    existing_user = db.query(User).filter_by(email=req.email).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A user with this email address already exists.",
        )

    base_slug = req.organization_name.lower().replace(" ", "-").replace("'", "")
    slug = base_slug
    if db.query(Tenant).filter_by(slug=slug).first():
        slug = f"{base_slug}-{uuid.uuid4().hex[:6]}"

    new_tenant = Tenant(name=req.organization_name, slug=slug)
    db.add(new_tenant)
    db.flush()

    new_user = User(
        tenant_id=new_tenant.id,
        email=req.email,
        password_hash=hash_password(req.password),
        full_name=req.full_name,
        role="owner",
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    token = create_access_token(new_user.id, new_tenant.id, role="owner")
    return {
        "access_token": token,
        "token_type": "bearer",
        "tenant_id": new_tenant.id,
        "user_id": new_user.id,
        "role": "owner",
        "email": new_user.email,
    }


@router.post("/login", response_model=AuthTokenResponse)
def login_user(req: LoginRequest, db: Session = Depends(get_db)) -> Any:
    """Authenticate user credentials and issue scoped JWT access token."""
    user = db.query(User).filter_by(email=req.email).first()
    if not user or not verify_password(req.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = create_access_token(user.id, user.tenant_id, role=user.role)
    return {
        "access_token": token,
        "token_type": "bearer",
        "tenant_id": user.tenant_id,
        "user_id": user.id,
        "role": user.role,
        "email": user.email,
    }


@router.get("/me")
def get_current_user_profile(
    auth: AuthContext = Depends(get_current_user), db: Session = Depends(get_db)
) -> dict[str, Any]:
    """Retrieve authenticated user identity, role, and tenant organization details."""
    tenant = db.query(Tenant).filter_by(id=auth.tenant_id).first()
    return {
        "user_id": auth.user_id,
        "tenant_id": auth.tenant_id,
        "tenant_name": tenant.name if tenant else "Default Organization",
        "role": auth.role,
        "email": auth.email,
    }


@router.get("/demo-token", response_model=AuthTokenResponse)
def issue_demo_token(role: str = "owner") -> Any:
    """Issue instant demo token for testing RBAC roles ('owner', 'planner', 'vendor')."""
    token = create_access_token("user-demo-planner", "tenant-default", role=role)
    return {
        "access_token": token,
        "token_type": "bearer",
        "tenant_id": "tenant-default",
        "user_id": "user-demo-planner",
        "role": role,
        "email": "planner@gatherly.app",
    }
