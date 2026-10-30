import uuid
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..api.rate_limit import limit_by_ip
from ..config import settings
from ..db.database import get_db
from ..db.models import Tenant, User
from ..db.seed import DEMO_TENANT_ID, ensure_demo_tenant
from .dependencies import AuthContext, get_current_user
from .security import burn_password_check, create_access_token, hash_password, verify_password

router = APIRouter(prefix="/api/auth", tags=["Authentication & Multi-Tenancy"])

AuthLimit = Depends(limit_by_ip("auth", 10))
DemoLimit = Depends(limit_by_ip("demo-token", 30))


class RegisterRequest(BaseModel):
    organization_name: str = Field(..., min_length=2, max_length=120)
    full_name: str = Field(..., min_length=2, max_length=120)
    email: EmailStr = Field(..., max_length=254)
    password: str = Field(..., min_length=8, max_length=128)


class LoginRequest(BaseModel):
    email: EmailStr = Field(..., max_length=254)
    password: str = Field(..., min_length=1, max_length=128)


class AuthTokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    tenant_id: str
    user_id: str
    role: str
    email: str


def _token_response(user_id: str, tenant_id: str, role: str, email: str) -> dict[str, Any]:
    return {
        "access_token": create_access_token(user_id, tenant_id, role=role),
        "token_type": "bearer",
        "tenant_id": tenant_id,
        "user_id": user_id,
        "role": role,
        "email": email,
    }


def _unique_slug(db: Session, organization_name: str) -> str:
    base_slug = organization_name.lower().replace(" ", "-").replace("'", "")
    if db.query(Tenant).filter_by(slug=base_slug).first():
        return f"{base_slug}-{uuid.uuid4().hex[:6]}"
    return base_slug


@router.post("/register", response_model=AuthTokenResponse, dependencies=[AuthLimit])
def register_organization(req: RegisterRequest, db: Annotated[Session, Depends(get_db)]) -> Any:
    """Register a new multi-tenant organization with an administrative owner."""
    email = req.email.lower()
    if db.query(User).filter_by(email=email).first():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A user with this email address already exists.",
        )

    new_tenant = Tenant(name=req.organization_name, slug=_unique_slug(db, req.organization_name))
    db.add(new_tenant)
    db.flush()

    new_user = User(
        tenant_id=new_tenant.id,
        email=email,
        password_hash=hash_password(req.password),
        full_name=req.full_name,
        role="owner",
    )
    db.add(new_user)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A user with this email address already exists.",
        ) from exc
    return _token_response(new_user.id, new_tenant.id, "owner", new_user.email)


@router.post("/login", response_model=AuthTokenResponse, dependencies=[AuthLimit])
def login_user(req: LoginRequest, db: Annotated[Session, Depends(get_db)]) -> Any:
    """Authenticate user credentials and issue scoped JWT access token."""
    user = db.query(User).filter_by(email=req.email.lower()).first()
    if not user:
        burn_password_check(req.password)
    if not user or not verify_password(req.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return _token_response(user.id, user.tenant_id, user.role, user.email)


@router.get("/me")
def get_current_user_profile(
    auth: Annotated[AuthContext, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> dict[str, Any]:
    """Retrieve authenticated user identity, role, and tenant organization details."""
    tenant = db.get(Tenant, auth.tenant_id)
    user = db.get(User, auth.user_id)  # tokens carry no email claim; read it from the account
    return {
        "user_id": auth.user_id,
        "tenant_id": auth.tenant_id,
        "tenant_name": tenant.name if tenant else "Default Organization",
        "role": auth.role,
        "email": user.email if user else auth.email,
    }


@router.get("/demo-token", response_model=AuthTokenResponse, dependencies=[DemoLimit])
def issue_demo_token(
    db: Annotated[Session, Depends(get_db)],
    role: Literal["owner", "planner", "vendor", "collaborator"] = "owner",
) -> Any:
    """Issue a sandbox token scoped to the isolated demo tenant (disabled when DEMO_MODE=false)."""
    if not settings.demo_mode:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found.")
    ensure_demo_tenant(db)
    return _token_response("user-demo-planner", DEMO_TENANT_ID, role, "demo@gatherly.app")
