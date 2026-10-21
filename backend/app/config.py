"""Application configuration and environment settings."""

import os

from pydantic import BaseModel, Field


class Settings(BaseModel):
    """Global configuration settings for Gatherly application."""

    app_name: str = "Gatherly"
    app_version: str = "1.0.0"
    host: str = Field(default_factory=lambda: os.getenv("HOST", "0.0.0.0"))
    port: int = Field(default_factory=lambda: int(os.getenv("PORT", "8080")))
    gemini_api_key: str = Field(
        default_factory=lambda: os.getenv("GEMINI_API_KEY", os.getenv("LLM_API_KEY", ""))
    )
    cors_origins: list[str] = ["*"]
    debug: bool = Field(default_factory=lambda: os.getenv("DEBUG", "false").lower() == "true")


settings = Settings()
