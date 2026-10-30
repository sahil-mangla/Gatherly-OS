"""Reasoning effort is capped for Gemini 3 models (latency) and never sent to other families."""

import pytest

from app.config import DEFAULT_GEMINI_MODEL
from app.services import mara_service

REPLY = {"response": "Check the venue contract."}


def ask():
    return mara_service.query_mara_copilot("general_advice", "help", {})


def test_default_model_request_caps_thinking(live_gemini):
    live_gemini.reply_json(REPLY)
    ask()
    config = live_gemini.last_body["generationConfig"]
    assert config["thinkingConfig"] == {"thinkingLevel": "low"}
    assert config["responseMimeType"] == "application/json" and config["temperature"] == 0.2


@pytest.mark.parametrize("model", ["gemini-2.5-pro", "gemini-flash-latest", "custom-model"])
def test_other_model_families_get_no_thinking_config(live_gemini, settings, monkeypatch, model):
    monkeypatch.setattr(settings, "gemini_model", model)
    live_gemini.reply_json(REPLY)
    ask()
    assert "thinkingConfig" not in live_gemini.calls[0][0].data.decode()


def test_with_thinking_never_mutates_the_shared_payload():
    payload = mara_service._build_payload("general_advice", "help", {})
    updated = mara_service._with_thinking(payload, DEFAULT_GEMINI_MODEL)
    assert "thinkingConfig" in updated["generationConfig"]
    assert "thinkingConfig" not in payload["generationConfig"]
    assert mara_service._with_thinking(payload, "gemini-2.5-pro") is payload
