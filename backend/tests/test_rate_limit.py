"""Fixed-window limiter, client address resolution and the login throttle."""

import pytest
from fastapi import HTTPException
from starlette.requests import Request

from app.api import rate_limit
from app.api.rate_limit import FixedWindowLimiter, client_ip, limit_by_ip

LOGIN = {"email": "nobody@example.com", "password": "bad-password"}


def make_request(forwarded=None, client=("10.0.0.1", 5000)):
    headers = [(b"x-forwarded-for", forwarded.encode())] if forwarded else []
    return Request({"type": "http", "headers": headers, "client": client})


def test_requests_within_the_limit_are_allowed_then_blocked():
    limiter = FixedWindowLimiter(window=60)
    results = [limiter.hit("k", 3, now=120.0) for _ in range(4)]
    assert results[:3] == [0, 0, 0]
    assert results[3] == 60


def test_retry_after_counts_down_to_the_window_end():
    limiter = FixedWindowLimiter(window=60)
    for _ in range(2):
        limiter.hit("k", 1, now=130.0)
    assert limiter.hit("k", 1, now=130.0) == 50
    assert limiter.hit("k", 1, now=179.5) == 1  # never reports 0 while still blocked


def test_window_rollover_resets_the_count():
    limiter = FixedWindowLimiter(window=60)
    assert [limiter.hit("k", 1, now=10.0), limiter.hit("k", 1, now=59.9)] == [0, 1]
    assert limiter.hit("k", 1, now=60.0) == 0  # new window
    assert limiter.hit("k", 1, now=61.0) == 59


def test_keys_are_isolated():
    limiter = FixedWindowLimiter()
    assert limiter.hit("a", 1, now=5.0) == 0
    assert limiter.hit("a", 1, now=5.0) > 0
    assert limiter.hit("b", 1, now=5.0) == 0


def test_reset_clears_every_counter():
    limiter = FixedWindowLimiter()
    limiter.hit("a", 1, now=5.0)
    limiter.reset()
    assert limiter.hit("a", 1, now=5.0) == 0


def test_stale_keys_are_purged_when_the_table_is_full(monkeypatch):
    monkeypatch.setattr(rate_limit, "_MAX_KEYS", 3)
    limiter = FixedWindowLimiter(window=60)
    for key in ("a", "b", "c"):
        limiter.hit(key, 5, now=10.0)
    limiter.hit("d", 5, now=70.0)
    assert set(limiter._hits) == {"d"}


def test_forwarded_header_is_ignored_without_a_trusted_proxy(settings, monkeypatch):
    monkeypatch.setattr(settings, "trust_proxy", False)
    assert client_ip(make_request("1.2.3.4")) == "10.0.0.1"


def test_first_forwarded_address_is_used_behind_a_trusted_proxy(settings, monkeypatch):
    monkeypatch.setattr(settings, "trust_proxy", True)
    assert client_ip(make_request(" 1.2.3.4 , 5.6.7.8")) == "1.2.3.4"
    assert client_ip(make_request("9" * 100)) == "9" * 64
    assert client_ip(make_request()) == "10.0.0.1"


def test_unknown_client_address_is_labelled(settings):
    assert client_ip(make_request(client=None)) == "unknown"


def test_dependency_raises_429_with_retry_after(rate_limiting):
    check = limit_by_ip("unit", 2)
    request = make_request()
    check(request)
    check(request)
    with pytest.raises(HTTPException) as caught:
        check(request)
    assert caught.value.status_code == 429
    assert caught.value.detail == "Too many requests. Please slow down."
    assert 1 <= int(caught.value.headers["Retry-After"]) <= 60


def test_disabled_flag_never_blocks(settings):
    assert settings.rate_limit_enabled is False
    check = limit_by_ip("unit-off", 1)
    for _ in range(5):
        check(make_request())


def test_login_is_limited_to_10_attempts_per_minute(client, rate_limiting):
    codes = [client.post("/api/auth/login", json=LOGIN).status_code for _ in range(11)]
    assert codes == [401] * 10 + [429]


def test_forwarded_ips_get_separate_buckets_only_behind_a_proxy(client, rate_limiting, monkeypatch):
    monkeypatch.setattr(rate_limiting, "trust_proxy", True)
    for _ in range(10):
        client.post("/api/auth/login", json=LOGIN, headers={"X-Forwarded-For": "7.7.7.7"})
    blocked = client.post("/api/auth/login", json=LOGIN, headers={"X-Forwarded-For": "7.7.7.7"})
    fresh = client.post("/api/auth/login", json=LOGIN, headers={"X-Forwarded-For": "8.8.8.8"})
    assert (blocked.status_code, fresh.status_code) == (429, 401)


def test_spoofed_forwarded_header_cannot_evade_the_limit_without_proxy(client, rate_limiting):
    for i in range(10):
        client.post("/api/auth/login", json=LOGIN, headers={"X-Forwarded-For": f"6.6.6.{i}"})
    res = client.post("/api/auth/login", json=LOGIN, headers={"X-Forwarded-For": "6.6.6.250"})
    assert res.status_code == 429
