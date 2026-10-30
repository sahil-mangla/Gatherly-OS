"""Tracing helpers: no-op fallbacks, failure handling and trace-context extraction."""

from unittest.mock import MagicMock

import pytest

from app.observability import telemetry
from app.observability.telemetry import (
    _hex_or_none,
    _NoOpSpan,
    _NoOpTracer,
    get_current_trace_context,
    get_tracer,
    init_telemetry,
    trace_span,
)


@pytest.fixture
def fresh_tracer(monkeypatch):
    monkeypatch.setattr(telemetry, "_tracer", None)


def test_disabled_otel_gives_a_noop_tracer_that_is_cached(fresh_tracer, settings, monkeypatch):
    monkeypatch.setattr(settings, "otel_enabled", False)
    tracer = init_telemetry()
    assert isinstance(tracer, _NoOpTracer)
    assert init_telemetry() is tracer and get_tracer() is tracer


def test_missing_sdk_gives_a_noop_tracer(fresh_tracer, monkeypatch):
    monkeypatch.setattr(telemetry, "HAS_OPENTELEMETRY", False)
    assert isinstance(get_tracer(), _NoOpTracer)


def test_noop_spans_accept_calls_and_never_swallow_exceptions(fresh_tracer, settings, monkeypatch):
    monkeypatch.setattr(settings, "otel_enabled", False)
    with pytest.raises(KeyError):
        with trace_span("work", {"a": 1, "b": "x", "c": True, "skipped": [1]}) as span:
            assert isinstance(span, _NoOpSpan)
            assert (span.is_recording(), span.get_span_context()) == (False, None)
            raise KeyError("propagates")


def test_trace_span_only_records_scalar_attributes(monkeypatch):
    span = MagicMock()
    tracer = MagicMock()
    tracer.start_as_current_span.return_value.__enter__.return_value = span
    monkeypatch.setattr(telemetry, "_tracer", tracer)
    with trace_span("op", {"s": "x", "i": 1, "f": 1.5, "b": False, "bad": {"k": 1}, "l": [1]}):
        pass
    recorded = {call.args[0] for call in span.set_attribute.call_args_list}
    assert recorded == {"s", "i", "f", "b"}
    tracer.start_as_current_span.assert_called_once_with("op")


def test_init_failure_degrades_to_noop(fresh_tracer, settings, monkeypatch, caplog):
    monkeypatch.setattr(settings, "otel_enabled", True)
    monkeypatch.setattr(telemetry, "HAS_OPENTELEMETRY", True)
    resource = MagicMock()
    resource.create.side_effect = ValueError("bad attrs")
    monkeypatch.setattr(telemetry, "Resource", resource)
    assert isinstance(init_telemetry(), _NoOpTracer)
    assert "OpenTelemetry init failed (ValueError)" in caplog.text


def test_init_configures_a_provider_and_console_exporter_in_debug(
    fresh_tracer, settings, monkeypatch
):
    monkeypatch.setattr(settings, "otel_enabled", True)
    monkeypatch.setattr(settings, "debug", True)
    mocks = {
        name: MagicMock()
        for name in (
            "Resource",
            "TracerProvider",
            "BatchSpanProcessor",
            "ConsoleSpanExporter",
            "trace",
        )
    }
    for name, mock in mocks.items():
        monkeypatch.setattr(telemetry, name, mock)
    tracer = init_telemetry()
    provider = mocks["TracerProvider"].return_value
    provider.add_span_processor.assert_called_once_with(mocks["BatchSpanProcessor"].return_value)
    mocks["trace"].set_tracer_provider.assert_called_once_with(provider)
    assert tracer is mocks["trace"].get_tracer.return_value


def test_trace_context_is_empty_without_the_sdk(monkeypatch):
    monkeypatch.setattr(telemetry, "HAS_OPENTELEMETRY", False)
    assert get_current_trace_context() == (None, None)


def test_trace_context_is_empty_outside_a_recording_span():
    assert get_current_trace_context() == (None, None)


def test_trace_context_survives_otel_errors(monkeypatch):
    broken = MagicMock()
    broken.get_current_span.side_effect = RuntimeError("no context")
    monkeypatch.setattr(telemetry, "trace", broken)
    assert get_current_trace_context() == (None, None)


def test_trace_context_returns_padded_hex_ids_for_a_recording_span(monkeypatch):
    span = MagicMock()
    span.is_recording.return_value = True
    span.get_span_context.return_value = MagicMock(trace_id=0xABC, span_id=0x1F)
    monkeypatch.setattr(telemetry, "trace", MagicMock(get_current_span=lambda: span))
    assert get_current_trace_context() == ("0" * 29 + "abc", "0" * 14 + "1f")


@pytest.mark.parametrize("value,width,expected", [(255, 4, "00ff"), (0, 4, None), (None, 4, None)])
def test_hex_helper(value, width, expected):
    assert _hex_or_none(value, width) == expected
