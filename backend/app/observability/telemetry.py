"""OpenTelemetry distributed tracing setup and custom span instrumentation helpers."""

from collections.abc import Generator
from contextlib import contextmanager
from typing import Any

from opentelemetry import trace
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor, ConsoleSpanExporter

from ..config import settings

_tracer = None


def init_telemetry() -> trace.Tracer:
    """Initialize OpenTelemetry TracerProvider with resource attributes."""
    global _tracer
    if _tracer is not None:
        return _tracer

    resource = Resource.create(
        {
            "service.name": settings.otel_service_name,
            "service.version": settings.app_version,
            "deployment.environment": settings.environment,
        }
    )

    provider = TracerProvider(resource=resource)

    # In debug mode or when requested, attach span processor
    if settings.debug:
        provider.add_span_processor(BatchSpanProcessor(ConsoleSpanExporter()))

    trace.set_tracer_provider(provider)
    _tracer = trace.get_tracer(settings.otel_service_name, settings.app_version)
    return _tracer


def get_tracer() -> trace.Tracer:
    """Get or initialize active OpenTelemetry tracer."""
    global _tracer
    if _tracer is None:
        return init_telemetry()
    return _tracer


@contextmanager
def trace_span(
    name: str, attributes: dict[str, Any] | None = None
) -> Generator[trace.Span, None, None]:
    """Context manager to trace critical calculation blocks with custom OpenTelemetry spans."""
    tracer = get_tracer()
    with tracer.start_as_current_span(name) as span:
        if attributes:
            for k, v in attributes.items():
                if isinstance(v, str | bool | int | float):
                    span.set_attribute(k, v)
        yield span


def get_current_trace_context() -> tuple[str | None, str | None]:
    """Retrieve active OpenTelemetry trace_id and span_id as hex strings."""
    span = trace.get_current_span()
    if span and span.is_recording():
        ctx = span.get_span_context()
        trace_id = format(ctx.trace_id, "032x") if ctx.trace_id else None
        span_id = format(ctx.span_id, "016x") if ctx.span_id else None
        return trace_id, span_id
    return None, None
