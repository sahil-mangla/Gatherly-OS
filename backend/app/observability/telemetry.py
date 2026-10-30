"""OpenTelemetry distributed tracing setup and custom span instrumentation helpers."""

import logging
from collections.abc import Generator
from contextlib import contextmanager
from typing import Any

from ..config import settings

_log = logging.getLogger("gatherly.telemetry")

try:
    from opentelemetry import trace
    from opentelemetry.sdk.resources import Resource
    from opentelemetry.sdk.trace import TracerProvider
    from opentelemetry.sdk.trace.export import BatchSpanProcessor, ConsoleSpanExporter

    HAS_OPENTELEMETRY = True
except ImportError:  # pragma: no cover - only when the optional OpenTelemetry SDK is absent
    HAS_OPENTELEMETRY = False
    trace = None


class _NoOpSpan:
    """Fallback no-op span when OpenTelemetry SDK is not installed or enabled."""

    def set_attribute(self, key: str, value: Any) -> None:
        pass

    def is_recording(self) -> bool:
        return False

    def get_span_context(self) -> None:
        return None


class _NoOpTracer:
    """Fallback no-op tracer when OpenTelemetry is unavailable."""

    @contextmanager
    def start_as_current_span(self, name: str, *args, **kwargs):
        yield _NoOpSpan()


_tracer = None


def init_telemetry() -> Any:
    """Initialize OpenTelemetry TracerProvider with resource attributes."""
    global _tracer
    if _tracer is not None:
        return _tracer

    if not HAS_OPENTELEMETRY or not settings.otel_enabled:
        _tracer = _NoOpTracer()
        return _tracer

    try:
        resource = Resource.create(
            {
                "service.name": settings.otel_service_name,
                "service.version": settings.app_version,
                "deployment.environment": settings.environment,
            }
        )
        provider = TracerProvider(resource=resource)
        if settings.debug:
            provider.add_span_processor(BatchSpanProcessor(ConsoleSpanExporter()))
        trace.set_tracer_provider(provider)
        _tracer = trace.get_tracer(settings.otel_service_name, settings.app_version)
    except (ValueError, TypeError, RuntimeError, AttributeError) as exc:
        _log.warning("OpenTelemetry init failed (%s); tracing disabled.", type(exc).__name__)
        _tracer = _NoOpTracer()
    return _tracer


def get_tracer() -> Any:
    """Get or initialize active OpenTelemetry tracer."""
    global _tracer
    if _tracer is None:
        return init_telemetry()
    return _tracer


@contextmanager
def trace_span(name: str, attributes: dict[str, Any] | None = None) -> Generator[Any, None, None]:
    """Context manager to trace critical calculation blocks with custom spans."""
    tracer = get_tracer()
    with tracer.start_as_current_span(name) as span:
        if attributes and span:
            for k, v in attributes.items():
                if isinstance(v, str | bool | int | float):
                    span.set_attribute(k, v)
        yield span


def _hex_or_none(value: int | None, width: int) -> str | None:
    return format(value, f"0{width}x") if value else None


def get_current_trace_context() -> tuple[str | None, str | None]:
    """Retrieve active OpenTelemetry trace_id and span_id as hex strings."""
    if not HAS_OPENTELEMETRY or trace is None:
        return None, None
    try:
        span = trace.get_current_span()
        ctx = span.get_span_context() if span and span.is_recording() else None
    except (AttributeError, TypeError, RuntimeError) as exc:
        _log.debug("Trace context unavailable: %s", type(exc).__name__)
        return None, None
    if not ctx:
        return None, None
    return _hex_or_none(ctx.trace_id, 32), _hex_or_none(ctx.span_id, 16)
