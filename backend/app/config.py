"""Application configuration and environment settings."""

import os
from pathlib import Path

from dotenv import load_dotenv
from pydantic import BaseModel, Field

# Load .env file from workspace root if present
root_dir = Path(__file__).resolve().parent.parent.parent
env_file = root_dir / ".env"
if env_file.exists():
    load_dotenv(dotenv_path=env_file)


class Settings(BaseModel):
    """Global configuration settings for Gatherly application."""

    app_name: str = "Gatherly"
    app_version: str = "1.0.0"
    host: str = Field(default_factory=lambda: os.getenv("HOST", "0.0.0.0"))
    port: int = Field(default_factory=lambda: int(os.getenv("PORT", "8080")))
    gemini_api_key: str = Field(
        default_factory=lambda: os.getenv("GEMINI_API_KEY", os.getenv("LLM_API_KEY", ""))
    )
    gemini_model: str = Field(default_factory=lambda: os.getenv("GEMINI_MODEL", "gemini-2.5-flash"))
    cors_origins: list[str] = ["*"]
    debug: bool = Field(default_factory=lambda: os.getenv("DEBUG", "false").lower() == "true")
    environment: str = Field(default_factory=lambda: os.getenv("ENVIRONMENT", "production"))

    # Enterprise Multi-Tenant Database
    database_url: str = Field(
        default_factory=lambda: os.getenv(
            "DATABASE_URL",
            "sqlite:////tmp/gatherly.db" if os.getenv("VERCEL") else "sqlite:///./gatherly.db",
        )
    )

    # Enterprise JWT & RBAC Security
    jwt_secret: str = Field(
        default_factory=lambda: os.getenv("JWT_SECRET", "gatherly-super-secure-enterprise-secret-32-chars")
    )
    jwt_algorithm: str = Field(default_factory=lambda: os.getenv("JWT_ALGORITHM", "HS256"))
    jwt_expiration_minutes: int = Field(
        default_factory=lambda: int(os.getenv("JWT_EXPIRATION_MINUTES", "1440"))
    )

    # Distributed Observability & Logging
    log_format: str = Field(default_factory=lambda: os.getenv("LOG_FORMAT", "json"))
    otel_enabled: bool = Field(
        default_factory=lambda: os.getenv("OTEL_ENABLED", "true").lower() == "true"
    )
    otel_service_name: str = Field(
        default_factory=lambda: os.getenv("OTEL_SERVICE_NAME", "gatherly-backend")
    )


settings = Settings()
