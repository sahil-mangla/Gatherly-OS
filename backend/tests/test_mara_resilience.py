"""Mara upstream protection: negative cache, bounded concurrency, timeout and the global cap."""

import logging
import threading
import urllib.error
from types import SimpleNamespace

import pytest

from app.services import mara_service, ttl_cache
from app.services.mara_service import query_mara_copilot

GOOD_REPLY = {"headline": "Book the florist", "advice": "Lock the quote this week."}


def ask(prompt="help"):
    return query_mara_copilot("prioritize_tasks", prompt, {})


@pytest.fixture
def clock(monkeypatch):
    now = {"t": 5000.0}
    monkeypatch.setattr(ttl_cache, "time", SimpleNamespace(monotonic=lambda: now["t"]))
    return now


FAILURES = {
    "timeout": lambda: TimeoutError("slow"),
    "http_500": lambda: urllib.error.HTTPError("https://x", 500, "boom", {}, None),
    "url_error": lambda: urllib.error.URLError("down"),
}


@pytest.mark.parametrize("name", sorted(FAILURES))
def test_failed_upstream_calls_are_cached_for_45_seconds(live_gemini, clock, name):
    live_gemini.fail_with(FAILURES[name]())
    results = [ask() for _ in range(3)]
    assert {r["provider"] for r in results} == {"deterministic_mock"}
    assert len(live_gemini.calls) == 1
    clock["t"] += 44.0
    ask()
    assert len(live_gemini.calls) == 1
    clock["t"] += 2.0  # 46 s after the failure
    ask()
    assert len(live_gemini.calls) == 2


def test_unusable_and_invalid_answers_are_negatively_cached(live_gemini, clock):
    live_gemini.reply_raw(b"<html>bad gateway</html>")
    ask("one")
    ask("one")
    live_gemini.reply_json({})
    ask("two")
    ask("two")
    assert len(live_gemini.calls) == 2


def test_the_negative_cache_is_per_request_key(live_gemini, clock):
    live_gemini.fail_with(TimeoutError())
    ask("one")
    live_gemini.reply_json(GOOD_REPLY)
    assert ask("two")["provider"] == "gemini-live"
    assert ask("one")["provider"] == "deterministic_mock"
    assert len(live_gemini.calls) == 2


def test_recovery_after_the_window_is_cached_for_60_seconds(live_gemini, clock):
    live_gemini.fail_with(TimeoutError())
    ask()
    live_gemini.reply_json(GOOD_REPLY)
    clock["t"] += 46.0
    assert ask()["provider"] == "gemini-live"
    clock["t"] += 59.0
    assert ask()["provider"] == "gemini-live" and len(live_gemini.calls) == 2
    clock["t"] += 2.0  # 61 s after the success
    ask()
    assert len(live_gemini.calls) == 3


def test_upstream_timeout_is_4_seconds(live_gemini):
    live_gemini.reply_json(GOOD_REPLY)
    ask()
    assert live_gemini.calls[0][1] == 4.0 == mara_service.GEMINI_TIMEOUT_SECONDS


def test_at_most_eight_upstream_calls_may_run_concurrently():
    slots = mara_service._slots
    held = [slots.acquire(blocking=False) for _ in range(9)]
    try:
        assert held == [True] * 8 + [False]
    finally:
        for taken in held:
            if taken:
                slots.release()
    assert mara_service.MAX_CONCURRENT_UPSTREAM == 8


@pytest.fixture
def one_slot(monkeypatch):
    slots = threading.BoundedSemaphore(1)
    monkeypatch.setattr(mara_service, "_slots", slots)
    return slots


def test_a_saturated_upstream_falls_back_immediately_without_negative_caching(
    live_gemini, one_slot, caplog
):
    live_gemini.reply_json(GOOD_REPLY)
    assert one_slot.acquire(blocking=False)
    with caplog.at_level(logging.WARNING, logger="gatherly.mara"):
        result = ask()
    assert result["provider"] == "deterministic_mock"
    assert live_gemini.calls == [] and "concurrency limit" in caplog.text
    one_slot.release()
    assert ask()["provider"] == "gemini-live"  # saturation was not remembered as a failure
    assert len(live_gemini.calls) == 1


def test_the_slot_is_released_after_failures(live_gemini, one_slot):
    live_gemini.fail_with(TimeoutError())
    ask("one")
    live_gemini.reply_json(GOOD_REPLY)
    assert ask("two")["provider"] == "gemini-live"
    assert one_slot.acquire(blocking=False)
    one_slot.release()


def post_mara(client, headers):
    return client.post("/api/mara", headers=headers, json={})


def test_global_cap_applies_across_users_with_retry_after(
    client, auth_headers, rate_limiting, monkeypatch
):
    monkeypatch.setattr(rate_limiting, "mara_global_per_minute", 5)
    users = [auth_headers("owner", user_id=f"u-global-{i % 3}") for i in range(6)]
    codes = [post_mara(client, h).status_code for h in users]
    assert codes == [200] * 5 + [429]
    blocked = post_mara(client, auth_headers("owner", user_id="u-global-fresh"))
    assert blocked.json() == {"detail": "Too many requests. Please slow down."}
    assert 1 <= int(blocked.headers["retry-after"]) <= 60


def test_the_default_global_cap_is_120_per_minute(client, auth_headers, rate_limiting):
    codes = [
        post_mara(client, auth_headers("owner", user_id=f"u-d-{i // 25}")).status_code
        for i in range(121)
    ]
    assert codes == [200] * 120 + [429]


def test_global_cap_does_not_touch_compute_endpoints(
    client, auth_headers, rate_limiting, monkeypatch
):
    monkeypatch.setattr(rate_limiting, "mara_global_per_minute", 1)
    headers = auth_headers("owner")
    assert post_mara(client, headers).status_code == 200
    assert post_mara(client, headers).status_code == 429
    risks = client.post("/api/risks", headers=headers, json={"event": {}})
    assert risks.status_code == 200


def test_unauthenticated_calls_do_not_burn_the_global_budget(
    client, auth_headers, rate_limiting, production_mode, monkeypatch
):
    monkeypatch.setattr(rate_limiting, "mara_global_per_minute", 2)
    assert [client.post("/api/mara", json={}).status_code for _ in range(4)] == [401] * 4
    assert post_mara(client, auth_headers()).status_code == 200


def test_per_user_rejections_do_not_burn_the_global_budget(
    client, auth_headers, rate_limiting, monkeypatch
):
    monkeypatch.setattr(rate_limiting, "mara_global_per_minute", 40)
    heavy = auth_headers("owner", user_id="u-heavy-g")
    codes = [post_mara(client, heavy).status_code for _ in range(35)]
    assert codes == [200] * 30 + [429] * 5
    other = auth_headers("owner", user_id="u-other-g")
    assert [post_mara(client, other).status_code for _ in range(11)] == [200] * 10 + [429]
