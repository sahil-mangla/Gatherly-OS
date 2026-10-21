"""Structured JSON logging formatted for Datadog, CloudWatch, and ELK stack integration."""

import json
import logging
import sys
from datetime import UTC, datetime
from typing import Any

from ..config import settings


class JsonLogFormatter(logging.Formatter):
    """Custom formatter producing single-line JSON log events with OpenTelemetry context."""

    def format(self, record: logging.LogRecord) -> str:
        log_payload: dict[str, Any] = {
            "timestamp": datetime.now(UTC).isoformat(),
            "level": record.levelname,
            "service": settings.otel_service_name,
            "environment": settings.environment,
            "logger": record.name,
            "message": record.getMessage(),
        }

        # Inject OpenTelemetry trace context if available
        trace_id = getattr(record, "trace_id", None)
        span_id = getattr(record, "span_id", None)
        if trace_id:
            log_payload["trace_id"] = trace_id
            log_payload["dd.trace_id"] = trace_id  # Datadog compatibility
        if span_id:
            log_payload["span_id"] = span_id
            log_payload["dd.span_id"] = span_id

        # Inject HTTP contextual metadata
        for field in ("correlation_id", "tenant_id", "user_id", "http_method", "path", "status_code", "duration_ms"):
            val = getattr(record, field, None)
            if val is not None:
                log_payload[field] = val

        if record.exc_info:
            log_payload["exception"] = self.formatException(record.exc_info)

        return json.dumps(log_payload)


def configure_logging() -> None:
    """Initialize root logger with JSON or standard console formatter based on settings."""
    root_logger = logging.getLogger()
    root_logger.setLevel(logging.DEBUG if settings.debug else logging.INFO)

    # Clear existing handlers
    for h in root_logger.handlers[:]:
        root_logger.removeHandler(h)

    handler = logging.StreamHandler(sys.stdout)
    if settings.log_format.lower() == "json":
        handler.setFormatter(JsonLogFormatter())
    else:
        handler.setFormatter(
            logging.Formatter("[%(asctime)s] [%(levelname)s] [%(name)s]: %(message)s")
        )

    root_logger.addHandler(handler)


logger = logging.getLogger("gatherly")
