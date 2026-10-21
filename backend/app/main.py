"""Main FastAPI application entry point."""

from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .api.event_routes import router as event_router
from .api.routes import router
from .auth.routes import router as auth_router
from .config import settings
from .db.database import init_db
from .observability.logging import configure_logging
from .observability.middleware import ObservabilityMiddleware
from .observability.telemetry import init_telemetry

# Configure Observability & Database on startup
configure_logging()
init_telemetry()
init_db()

app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="Gatherly Celebration Planning & Decision Loop API",
)

# Observability Middleware (Correlation IDs, Tracing, JSON Access Logs)
app.add_middleware(ObservabilityMiddleware)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", tags=["Health"])
def health_endpoint():
    """Direct health check endpoint for container and serverless probes."""
    return {"status": "ok", "service": settings.otel_service_name, "version": settings.app_version}


# Include API Routers
app.include_router(router)
app.include_router(auth_router)
app.include_router(event_router)

# Mount frontend static directory across local, Docker, and Vercel environments
frontend_candidates = [
    Path(__file__).resolve().parent.parent.parent / "frontend",
    Path.cwd() / "frontend",
    Path("/var/task/frontend"),
]
frontend_dir = next((d for d in frontend_candidates if d.exists()), None)
if frontend_dir:
    app.mount("/", StaticFiles(directory=str(frontend_dir), html=True), name="frontend")
