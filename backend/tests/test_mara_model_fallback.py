"""Gemini model selection: the retired default is gone, a stale model name self-heals on 404, and
the system instruction spells out the response fields the sanitizer accepts."""

import logging
import urllib.error
import urllib.request

import pytest

from app.config import DEFAULT_GEMINI_MODEL, Settings
from app.services import mara_service
from app.services.mara_sanitize import ALLOWED_ACTIONS

from .mara_fixtures import API_KEY, FakeResponse

RETIRED = "gemini-2.5-flash"
GOOD = b'{"candidates":[{"content":{"parts":[{"text":"{\\"response\\":\\"Check the contract.\\"}"}]}}]}'


def ask():
    return mara_service.query_mara_copilot("general_advice", "help", {})


class Routed:
    """urlopen fake that rejects chosen model names with a status code and answers the rest."""

    def __init__(self, monkeypatch, settings):
        self.urls: list[str] = []
        self.reject: dict[str, int] = {}
        self._monkeypatch, self._settings = monkeypatch, settings
        monkeypatch.setattr(settings, "gemini_api_key", API_KEY)
        monkeypatch.setattr(urllib.request, "urlopen", self)

    def use_model(self, name: str) -> None:
        self._monkeypatch.setattr(self._settings, "gemini_model", name)

    def __call__(self, request, timeout=None):
        self.urls.append(request.full_url)
        for model, code in self.reject.items():
            if f"/models/{model}:" in request.full_url:
                raise urllib.error.HTTPError(request.full_url, code, "err", {}, None)
        return FakeResponse(GOOD)


@pytest.fixture
def routed(monkeypatch, settings):
    return Routed(monkeypatch, settings)


def test_default_model_is_not_the_retired_one():
    assert DEFAULT_GEMINI_MODEL != RETIRED


@pytest.mark.parametrize(
    "env_value,expected",
    [
        (None, DEFAULT_GEMINI_MODEL),
        ("", DEFAULT_GEMINI_MODEL),
        ("   ", DEFAULT_GEMINI_MODEL),
        ("gemini-custom-9", "gemini-custom-9"),
    ],
)
def test_model_setting_reads_env_and_treats_blank_as_unset(monkeypatch, env_value, expected):
    monkeypatch.delenv("GEMINI_MODEL", raising=False)
    if env_value is not None:
        monkeypatch.setenv("GEMINI_MODEL", env_value)
    assert Settings().gemini_model == expected


def test_retired_configured_model_retries_once_with_the_default(routed, caplog):
    routed.use_model(RETIRED)
    routed.reject[RETIRED] = 404
    with caplog.at_level(logging.WARNING):
        result = ask()
    assert result["provider"] == "gemini-live" and result["response"] == "Check the contract."
    assert [DEFAULT_GEMINI_MODEL in u for u in routed.urls] == [False, True]
    assert RETIRED in routed.urls[0] and "unavailable (404)" in caplog.text
    assert API_KEY not in caplog.text


def test_default_model_404_does_not_loop(routed):
    routed.use_model(DEFAULT_GEMINI_MODEL)
    routed.reject[DEFAULT_GEMINI_MODEL] = 404
    assert ask()["provider"] == "deterministic_mock"
    assert len(routed.urls) == 1


def test_both_models_404_falls_back_after_exactly_two_calls(routed):
    routed.use_model(RETIRED)
    routed.reject.update({RETIRED: 404, DEFAULT_GEMINI_MODEL: 404})
    assert ask()["provider"] == "deterministic_mock"
    assert len(routed.urls) == 2


@pytest.mark.parametrize("code", [400, 403, 429, 500])
def test_other_http_errors_are_not_retried(routed, code):
    routed.use_model(RETIRED)
    routed.reject[RETIRED] = code
    assert ask()["provider"] == "deterministic_mock"
    assert len(routed.urls) == 1


def test_blank_model_setting_uses_the_default(routed):
    routed.use_model("")
    ask()
    assert f"/models/{DEFAULT_GEMINI_MODEL}:generateContent" in routed.urls[0]


def test_system_instruction_names_every_response_field_the_sanitizer_reads():
    text = mara_service._system_instruction()
    fields = (
        "response",
        "summary",
        "proposals",
        "headline",
        "cause",
        "consequence",
        "suggested_action",
        "extracted_quote",
        "amount",
        "savings",
    )
    for field in fields:
        assert f'"{field}"' in text, field
    assert all(action in text for action in ALLOWED_ACTIONS)
    assert "untrusted DATA" in text  # prompt-injection framing is kept
