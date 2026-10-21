"""ASGI Middleware for HTTP correlation IDs, distributed trace propagation, and access logging."""

import logging
import time
import uuid

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from .logging import logger
from .telemetry import get_current_trace_context, trace_span


class ObservabilityMiddleware(BaseHTTPMiddleware):
    """Intercepts all HTTP traffic to record correlation IDs, spans, and structured logs."""

    async def dispatch(self, request: Request, call_next) -> Response:
        # Correlation ID from client or new UUID
        correlation_id = request.headers.get("X-Correlation-ID") or f"corr-{uuid.uuid4().hex[:12]}"
        start_time = time.perf_counter()

        # Check tenant ID header if present
        tenant_id = request.headers.get("X-Tenant-ID", "unknown")

        span_name = f"HTTP {request.method} {request.url.path}"
        with trace_span(
            span_name,
            attributes={
                "http.method": request.method,
                "http.url": str(request.url),
                "http.target": request.url.path,
                "correlation_id": correlation_id,
            },
        ):
            trace_id, span_id = get_current_trace_context()
            try:
                response = await call_next(request)
            except Exception as exc:
                duration_ms = round((time.perf_counter() - start_time) * 1000, 2)
                logger.error(
                    f"Request failed: {request.method} {request.url.path}",
                    exc_info=exc,
                    extra={
                        "correlation_id": correlation_id,
                        "tenant_id": tenant_id,
                        "trace_id": trace_id,
                        "span_id": span_id,
                        "http_method": request.method,
                        "path": request.url.path,
                        "status_code": 500,
                        "duration_ms": duration_ms,
                    },
                )
                raise exc

            duration_ms = round((time.perf_counter() - start_time) * 1000, 2)

            # Append telemetry headers to response
            response.headers["X-Correlation-ID"] = correlation_id
            if trace_id:
                response.headers["X-Trace-ID"] = trace_id

            # Emit structured access log record (skip static files to reduce noise)
            if not request.url.path.startswith("/src"):
                log_level = logging.INFO if response.status_code < 400 else logging.WARNING
                logger.log(
                    log_level,
                    f"{request.method} {request.url.path} {response.status_code} ({duration_ms}ms)",
                    extra={
                        "correlation_id": correlation_id,
                        "tenant_id": tenant_id,
                        "trace_id": trace_id,
                        "span_id": span_id,
                        "http_method": request.method,
                        "path": request.url.path,
                        "status_code": response.status_code,
                        "duration_ms": duration_ms,
                    },
                )

            return response
