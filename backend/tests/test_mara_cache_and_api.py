"""TTL cache behaviour and the authenticated POST /api/mara endpoint."""

from types import SimpleNamespace

import pytest

from app.services import ttl_cache
from app.services.ttl_cache import TTLCache, cache_key


@pytest.fixture
def clock(monkeypatch):
    now = {"t": 1000.0}
    monkeypatch.setattr(ttl_cache, "time", SimpleNamespace(monotonic=lambda: now["t"]))
    return now


def test_cache_key_is_stable_and_order_independent():
    assert cache_key("m", {"a": 1, "b": 2}) == cache_key("m", {"b": 2, "a": 1})
    assert cache_key("m", "x") != cache_key("m", "y")
    assert len(cache_key("m")) == 64


def test_hit_and_miss(clock):
    cache = TTLCache(ttl=10)
    assert cache.get("k") is None
    cache.set("k", {"v": 1})
    assert cache.get("k") == {"v": 1}


def test_entries_expire_after_ttl(clock):
    cache = TTLCache(ttl=10)
    cache.set("k", "v")
    clock["t"] += 9.9
    assert cache.get("k") == "v"
    clock["t"] += 0.2
    assert cache.get("k") is None
    assert cache.get("k") is None  # expired entry was removed, not resurrected


def test_overwrite_refreshes_ttl(clock):
    cache = TTLCache(ttl=10)
    cache.set("k", "old")
    clock["t"] += 8
    cache.set("k", "new")
    clock["t"] += 8
    assert cache.get("k") == "new"


def test_evicts_oldest_beyond_128_entries(clock):
    cache = TTLCache()
    for i in range(129):
        cache.set(f"k{i}", i)
    assert cache.get("k0") is None
    assert cache.get("k1") == 1 and cache.get("k128") == 128


def test_recently_read_entries_survive_eviction(clock):
    cache = TTLCache(max_entries=3)
    for key in ("a", "b", "c"):
        cache.set(key, key)
    assert cache.get("a") == "a"  # refreshes 'a'; 'b' is now the oldest
    cache.set("d", "d")
    assert [cache.get(k) for k in ("a", "b", "c", "d")] == ["a", None, "c", "d"]


def test_clear_empties_the_cache(clock):
    cache = TTLCache()
    cache.set("k", 1)
    cache.clear()
    assert cache.get("k") is None


def test_mara_requires_token_in_production(client, production_mode):
    res = client.post("/api/mara", json={"prompt": "hi"})
    assert res.status_code == 401
    assert res.headers["www-authenticate"] == "Bearer"


def test_mara_returns_response_for_authenticated_user(client, auth_headers):
    res = client.post(
        "/api/mara",
        headers=auth_headers("vendor"),
        json={"operation": "general_advice", "context": {"event": {"name": "Gala"}}},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["success"] is True and body["provider"] == "deterministic_mock"
    assert "Gala" in body["response"]


def test_mara_rejects_prompt_over_4000_chars(client, auth_headers):
    ok = client.post("/api/mara", headers=auth_headers(), json={"prompt": "p" * 4000})
    too_long = client.post("/api/mara", headers=auth_headers(), json={"prompt": "p" * 4001})
    assert ok.status_code == 200
    assert too_long.status_code == 422
    assert too_long.json()["detail"][0]["loc"] == ["body", "prompt"]


@pytest.mark.parametrize("context", [[1, 2], "text", 5, None])
def test_mara_context_must_be_an_object(client, auth_headers, context):
    res = client.post("/api/mara", headers=auth_headers(), json={"context": context})
    assert res.status_code == 422
    assert res.json()["detail"][0]["loc"] == ["body", "context"]


def test_mara_is_limited_to_30_calls_per_minute(client, auth_headers, rate_limiting):
    headers = auth_headers("owner", user_id="u-rl")
    codes = [client.post("/api/mara", headers=headers, json={}).status_code for _ in range(31)]
    assert codes == [200] * 30 + [429]
    blocked = client.post("/api/mara", headers=headers, json={})
    assert blocked.json() == {"detail": "Too many requests. Please slow down."}
    assert 1 <= int(blocked.headers["retry-after"]) <= 60


def test_rate_limit_is_per_user(client, auth_headers, rate_limiting):
    for _ in range(31):
        client.post("/api/mara", headers=auth_headers(user_id="u-heavy"), json={})
    other = client.post("/api/mara", headers=auth_headers(user_id="u-light"), json={})
    assert other.status_code == 200
