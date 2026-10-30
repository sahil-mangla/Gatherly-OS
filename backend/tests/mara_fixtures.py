"""Fixtures that fake Gemini at the ``urllib.request.urlopen`` boundary (no real network)."""

import json
import urllib.request

import pytest

API_KEY = "AIza-test-key-DO-NOT-LEAK-123456"


class FakeResponse:
    """Minimal context-manager response exposing ``read`` like urllib's."""

    def __init__(self, body: bytes):
        self._body = body

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def read(self):
        return self._body


class FakeGemini:
    """Records every outgoing request and replays a configurable outcome."""

    def __init__(self):
        self.calls = []
        self.outcome = FakeResponse(b"{}")

    def reply_text(self, text: str) -> None:
        wrapper = {"candidates": [{"content": {"parts": [{"text": text}]}}]}
        self.outcome = FakeResponse(json.dumps(wrapper).encode())

    def reply_json(self, payload) -> None:
        self.reply_text(json.dumps(payload))

    def reply_raw(self, body: bytes) -> None:
        self.outcome = FakeResponse(body)

    def fail_with(self, error: BaseException) -> None:
        self.outcome = error

    def __call__(self, request, timeout=None):
        self.calls.append((request, timeout))
        if isinstance(self.outcome, BaseException):
            raise self.outcome
        return self.outcome

    @property
    def last_body(self) -> dict:
        return json.loads(self.calls[-1][0].data.decode())

    @property
    def last_user_text(self) -> str:
        return self.last_body["contents"][0]["parts"][0]["text"]


@pytest.fixture
def live_gemini(monkeypatch, settings):
    """A configured API key plus a recording fake for ``urlopen``."""
    fake = FakeGemini()
    monkeypatch.setattr(settings, "gemini_api_key", API_KEY)
    monkeypatch.setattr(urllib.request, "urlopen", fake)
    return fake


@pytest.fixture
def forbid_network(monkeypatch):
    """Fail loudly if any code path tries to open a network connection."""

    def explode(*args, **kwargs):
        raise AssertionError("network access attempted")

    monkeypatch.setattr(urllib.request, "urlopen", explode)
