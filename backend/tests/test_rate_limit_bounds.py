"""The limiter's key table is hard-capped with O(1) eviction (no full rebuild per hit)."""

import time

from app.api import rate_limit
from app.api.rate_limit import FixedWindowLimiter


def test_default_cap_is_ten_thousand_keys():
    assert rate_limit._MAX_KEYS == 10_000
    assert FixedWindowLimiter().max_keys == 10_000


def test_inserting_15k_distinct_keys_never_exceeds_the_cap_and_stays_fast():
    limiter = FixedWindowLimiter(window=60)
    started = time.perf_counter()
    peak = 0
    for i in range(15_000):
        limiter.hit(f"ip:{i}", 5, now=100.0)
        peak = max(peak, len(limiter._hits))
    elapsed = time.perf_counter() - started
    assert peak == 10_000 and len(limiter._hits) == 10_000
    assert elapsed < 1.0
    assert "ip:0" not in limiter._hits and "ip:14999" in limiter._hits


def test_evicting_the_oldest_keys_keeps_the_most_recent_counters():
    limiter = FixedWindowLimiter(window=60, max_keys=3)
    for i in range(5):
        limiter.hit(f"k{i}", 1, now=10.0)
    assert list(limiter._hits) == ["k2", "k3", "k4"]
    assert limiter.hit("k4", 1, now=10.0) > 0  # a surviving key keeps counting
    assert limiter.hit("k0", 1, now=10.0) == 0  # an evicted key starts over


def test_a_busy_key_is_never_the_one_evicted():
    limiter = FixedWindowLimiter(window=60, max_keys=2)
    for i in range(10):
        limiter.hit("busy", 100, now=10.0)
        limiter.hit(f"noise{i}", 100, now=10.0)
    assert "busy" in limiter._hits and len(limiter._hits) == 2
