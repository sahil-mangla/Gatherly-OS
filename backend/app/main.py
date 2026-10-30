"""Main FastAPI application entry point."""

from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.staticfiles import StaticFiles

from .api.errors import register_error_handlers
from .api.event_routes import router as event_router
from .api.middleware import BodySizeLimitMiddleware, SecurityHeadersMiddleware
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

# Interactive API docs are a development aid; they are not exposed in production.
docs_kwargs = (
    {"docs_url": None, "redoc_url": None, "openapi_url": None} if settings.is_production else {}
)

app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="Gatherly Celebration Planning & Decision Loop API",
    **docs_kwargs,
)

# Middleware: the last one added is outermost (security headers wrap everything).
# The body-size cap is innermost on purpose: ObservabilityMiddleware (BaseHTTPMiddleware) reads the
# body through an anyio task group that would wrap the cap's exception into a generic 400.
app.add_middleware(BodySizeLimitMiddleware)
app.add_middleware(ObservabilityMiddleware)
if settings.cors_origins:  # no origins configured means same-origin only
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=settings.cors_allow_credentials,
        allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "X-Correlation-ID", "X-Tenant-ID"],
    )
app.add_middleware(GZipMiddleware, minimum_size=1024)
app.add_middleware(SecurityHeadersMiddleware)
register_error_handlers(app)


# Include API Routers (the health probe lives in the API router as /api/health)
app.include_router(router)
app.include_router(auth_router)
app.include_router(event_router)


class CachedStaticFiles(StaticFiles):
    """Static files with revalidation for HTML and a short public cache for assets."""

    ASSET_SUFFIXES = (".js", ".css", ".svg", ".png", ".jpg", ".jpeg", ".webp", ".ico", ".woff2")

    def file_response(self, full_path, *args, **kwargs):
        response = super().file_response(full_path, *args, **kwargs)
        is_asset = str(full_path).lower().endswith(self.ASSET_SUFFIXES)
        response.headers["Cache-Control"] = "public, max-age=3600" if is_asset else "no-cache"
        return response


# Mount frontend static directory across local, Docker, and Vercel environments
frontend_candidates = [
    Path(__file__).resolve().parent.parent.parent / "frontend",
    Path.cwd() / "frontend",
    Path("/var/task/frontend"),
]
frontend_dir = next((d for d in frontend_candidates if d.exists()), None)
if frontend_dir:
    app.mount("/", CachedStaticFiles(directory=str(frontend_dir), html=True), name="frontend")
