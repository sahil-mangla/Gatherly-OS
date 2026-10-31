"""ASGI Middleware for HTTP correlation IDs, distributed trace propagation, and access logging."""

import logging
import re
import time
import uuid
from typing import Any

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from .logging import logger
from .telemetry import get_current_trace_context, trace_span

SAFE_ID = re.compile(r"^[A-Za-z0-9._-]{1,64}$")
STRIPPED_PREFIXES = ("/health", "/simulate", "/mara", "/vendors", "/auth", "/events")


def safe_id(value: str | None, fallback: str) -> str:
    """Accept a client-supplied identifier only if it is short and log-safe."""
    return value if value and SAFE_ID.match(value) else fallback


def _has_stripped_prefix(path: str) -> bool:
    """True for ``/events`` or ``/events/...`` but not look-alikes such as ``/eventsfoo``."""
    return any(path == prefix or path.startswith(prefix + "/") for prefix in STRIPPED_PREFIXES)


def normalize_path(path: str) -> str:
    """Normalize serverless path artifacts (Vercel rewrite destinations, stripped prefixes)."""
    if path.startswith("/api/index.py"):
        sub = path[len("/api/index.py") :]
        return "/api" + sub if sub else "/api/health"
    if _has_stripped_prefix(path):
        return "/api" + path
    return path


def _log_fields(
    request: Request, ids: dict[str, str | None], status_code: int, duration_ms: float
) -> dict[str, Any]:
    return {
        **ids,
        "http_method": request.method,
        "path": request.url.path,
        "status_code": status_code,
        "duration_ms": duration_ms,
    }


class ObservabilityMiddleware(BaseHTTPMiddleware):
    """Intercepts all HTTP traffic to record correlation IDs, spans, and structured logs."""

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        """Wrap the request in a span and log it with its correlation ID."""
        request.scope["path"] = normalize_path(request.scope.get("path", ""))
        correlation_id = safe_id(
            request.headers.get("X-Correlation-ID"), f"corr-{uuid.uuid4().hex[:12]}"
        )
        tenant_id = safe_id(request.headers.get("X-Tenant-ID"), "unknown")
        path = request.url.path
        start_time = time.perf_counter()

        attributes = {
            "http.method": request.method,
            "http.target": path,
            "correlation_id": correlation_id,
        }
        with trace_span(f"HTTP {request.method} {path}", attributes=attributes):
            trace_id, span_id = get_current_trace_context()
            ids = {
                "correlation_id": correlation_id,
                "tenant_id": tenant_id,
                "trace_id": trace_id,
                "span_id": span_id,
            }
            try:
                response = await call_next(request)
            except Exception as exc:
                elapsed = round((time.perf_counter() - start_time) * 1000, 2)
                logger.error(
                    f"Request failed: {request.method} {path}",
                    exc_info=exc,
                    extra=_log_fields(request, ids, 500, elapsed),
                )
                return JSONResponse(
                    {"detail": "Internal server error."},
                    status_code=500,
                    headers={"X-Correlation-ID": correlation_id},
                )

            elapsed = round((time.perf_counter() - start_time) * 1000, 2)
            response.headers["X-Correlation-ID"] = correlation_id
            if trace_id:
                response.headers["X-Trace-ID"] = trace_id
            self._log_access(request, response, ids, elapsed)
            return response

    @staticmethod
    def _log_access(
        request: Request, response: Response, ids: dict[str, str | None], elapsed: float
    ) -> None:
        """Emit a structured access log record (skipping static assets to reduce noise)."""
        path = request.url.path
        if path.startswith("/src"):
            return
        level = logging.INFO if response.status_code < 400 else logging.WARNING
        logger.log(
            level,
            f"{request.method} {path} {response.status_code} ({elapsed}ms)",
            extra=_log_fields(request, ids, response.status_code, elapsed),
        )
