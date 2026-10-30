"""Application configuration and environment settings."""

import logging
import os
import secrets
from pathlib import Path

from dotenv import load_dotenv
from pydantic import BaseModel, Field

# Load .env file from workspace root if present
root_dir = Path(__file__).resolve().parent.parent.parent
env_file = root_dir / ".env"
if env_file.exists():
    load_dotenv(dotenv_path=env_file)

_log = logging.getLogger("gatherly.config")
# The historical public default; it is never accepted as a real secret.
_PUBLIC_DEFAULT_SECRET = "gatherly-super-secure-enterprise-secret-32-chars"
_MIN_SECRET_BYTES = 32


def _flag(name: str, default: str) -> bool:
    return os.getenv(name, default).strip().lower() in ("1", "true", "yes", "on")


def _default_environment() -> str:
    """Hosted (Vercel) deployments default to production; local runs to development."""
    return os.getenv("ENVIRONMENT") or ("production" if os.getenv("VERCEL") else "development")


def resolve_jwt_secret(environment: str) -> str:
    """Return a signing secret, refusing weak or public secrets in production."""
    secret = os.getenv("JWT_SECRET", "").strip()
    strong = len(secret.encode("utf-8")) >= _MIN_SECRET_BYTES
    if secret and secret != _PUBLIC_DEFAULT_SECRET and (strong or environment != "production"):
        return secret
    if environment == "production" and not os.getenv("VERCEL"):
        raise RuntimeError(
            "JWT_SECRET must be set to a random value of at least 32 bytes when "
            "ENVIRONMENT=production (generate one with: python -c "
            "'import secrets; print(secrets.token_urlsafe(48))')."
        )
    if environment == "production":
        _log.warning(
            "JWT_SECRET is unset or weak; using a random per-instance secret. Tokens will not "
            "validate across serverless instances - set JWT_SECRET in the project settings."
        )
    # Export the generated secret so duplicate imports and spawned workers share one key.
    generated = os.environ["JWT_SECRET"] = secrets.token_urlsafe(48)
    return generated


def _default_cors_origins() -> list[str]:
    raw = os.getenv("CORS_ORIGINS", "").strip()
    if raw:
        return [o.strip() for o in raw.split(",") if o.strip()]
    return [] if _default_environment() == "production" else ["*"]


class Settings(BaseModel):
    """Global configuration settings for Gatherly application."""

    app_name: str = "Gatherly"
    app_version: str = "1.0.0"
    host: str = Field(default_factory=lambda: os.getenv("HOST", "127.0.0.1"))
    port: int = Field(default_factory=lambda: int(os.getenv("PORT", "8080")))
    gemini_api_key: str = Field(
        default_factory=lambda: os.getenv("GEMINI_API_KEY", os.getenv("LLM_API_KEY", ""))
    )
    gemini_model: str = Field(default_factory=lambda: os.getenv("GEMINI_MODEL", "gemini-2.5-flash"))
    cors_origins: list[str] = Field(default_factory=_default_cors_origins)
    debug: bool = Field(default_factory=lambda: _flag("DEBUG", "false"))
    environment: str = Field(default_factory=_default_environment)
    on_vercel: bool = Field(default_factory=lambda: bool(os.getenv("VERCEL")))

    # Enterprise Multi-Tenant Database
    database_url: str = Field(
        default_factory=lambda: os.getenv(
            "DATABASE_URL",
            "sqlite:////tmp/gatherly.db" if os.getenv("VERCEL") else "sqlite:///./gatherly.db",
        )
    )

    # JWT & RBAC Security
    jwt_secret: str = Field(default_factory=lambda: resolve_jwt_secret(_default_environment()))
    jwt_algorithm: str = "HS256"  # fixed allow-list; not configurable
    jwt_expiration_minutes: int = Field(
        default_factory=lambda: int(os.getenv("JWT_EXPIRATION_MINUTES", "60"))
    )
    password_hash_iterations: int = Field(
        default_factory=lambda: int(os.getenv("PBKDF2_ITERATIONS", "600000"))
    )
    seed_admin_password: str = Field(default_factory=lambda: os.getenv("SEED_ADMIN_PASSWORD", ""))
    demo_mode: bool = Field(default_factory=lambda: _flag("DEMO_MODE", "true"))
    rate_limit_enabled: bool = Field(default_factory=lambda: _flag("RATE_LIMIT_ENABLED", "true"))
    trust_proxy: bool = Field(
        default_factory=lambda: _flag("TRUST_PROXY", "true" if os.getenv("VERCEL") else "false")
    )
    max_body_bytes: int = 1_048_576

    # Distributed Observability & Logging
    log_format: str = Field(default_factory=lambda: os.getenv("LOG_FORMAT", "json"))
    otel_enabled: bool = Field(default_factory=lambda: _flag("OTEL_ENABLED", "true"))
    otel_service_name: str = Field(
        default_factory=lambda: os.getenv("OTEL_SERVICE_NAME", "gatherly-backend")
    )

    @property
    def is_production(self) -> bool:
        return self.environment == "production"

    @property
    def allow_guest(self) -> bool:
        """Unauthenticated guest access is a development/test convenience only."""
        return self.environment in ("development", "test")

    @property
    def cors_allow_credentials(self) -> bool:
        return bool(self.cors_origins) and "*" not in self.cors_origins


settings = Settings()
