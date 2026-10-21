#!/usr/bin/env python3
"""High-throughput async load testing harness with automated SLA gating."""

import argparse
import asyncio
import os
import statistics
import sys
import time
from typing import Any

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

import httpx

MOCK_EVENT = {
    "id": "evt-load-test",
    "title": "Summer Celebration",
    "guest_count": 120,
    "venue_capacity": 150,
    "budget": {
        "total_allocated": 35000.0,
        "categories": {
            "catering": {"allocated": 12000.0, "actual": 11500.0, "committed": 0.0},
            "venue": {"allocated": 8000.0, "actual": 8000.0, "committed": 0.0},
        },
    },
    "timeline": {
        "milestones": [
            {"id": "m1", "title": "Deposit Due", "date": "2026-06-01", "completed": False}
        ]
    },
}

TARGET_SCENARIOS = [
    ("GET", "/api/health", None),
    ("GET", "/api/auth/demo-token?role=planner", None),
    (
        "POST",
        "/api/simulate",
        {"event": MOCK_EVENT, "guest_delta": 25, "catering_variance_pct": 10.0},
    ),
    (
        "POST",
        "/api/vendors/parse-seed",
        {"text": "Catering quote: $65/person for 120 guests. Deposit 30%. Excludes cleanup fee."},
    ),
]


async def execute_request(client: httpx.AsyncClient, base_url: str, idx: int) -> tuple[float, bool]:
    method, path, body = TARGET_SCENARIOS[idx % len(TARGET_SCENARIOS)]
    url = f"{base_url.rstrip('/')}{path}"
    start = time.perf_counter()
    try:
        if method == "GET":
            res = await client.get(url, timeout=5.0)
        else:
            res = await client.post(url, json=body, timeout=5.0)
        elapsed_ms = (time.perf_counter() - start) * 1000.0
        return elapsed_ms, res.status_code in (200, 201)
    except Exception:
        elapsed_ms = (time.perf_counter() - start) * 1000.0
        return elapsed_ms, False


async def run_load_test(base_url: str, total_reqs: int, concurrency: int, use_asgi: bool = False) -> dict[str, Any]:
    sem = asyncio.Semaphore(concurrency)
    results: list[tuple[float, bool]] = []

    if use_asgi:
        from backend.app.main import app
        transport = httpx.ASGITransport(app=app)
        client = httpx.AsyncClient(transport=transport, base_url="http://testserver")
        target_base = "http://testserver"
    else:
        limits = httpx.Limits(max_keepalive_connections=concurrency, max_connections=concurrency * 2)
        client = httpx.AsyncClient(limits=limits)
        target_base = base_url

    async with client:
        async def worker(idx: int):
            async with sem:
                res = await execute_request(client, target_base, idx)
                results.append(res)

        wall_start = time.perf_counter()
        await asyncio.gather(*(worker(i) for i in range(total_reqs)))
        wall_elapsed = time.perf_counter() - wall_start

    latencies = [r[0] for r in results]
    successes = sum(1 for r in results if r[1])
    failures = len(results) - successes
    latencies.sort()

    def pct(p: float) -> float:
        k = (len(latencies) - 1) * (p / 100.0)
        f = int(k)
        c = min(f + 1, len(latencies) - 1)
        return latencies[f] + (k - f) * (latencies[c] - latencies[f])

    return {
        "total": len(results),
        "concurrency": concurrency,
        "mode": "in-process (ASGI)" if use_asgi else f"socket ({base_url})",
        "wall_time_s": wall_elapsed,
        "rps": len(results) / wall_elapsed if wall_elapsed > 0 else 0,
        "successes": successes,
        "failures": failures,
        "min_ms": min(latencies) if latencies else 0,
        "avg_ms": statistics.mean(latencies) if latencies else 0,
        "p50_ms": pct(50),
        "p90_ms": pct(90),
        "p95_ms": pct(95),
        "p99_ms": pct(99),
        "max_ms": max(latencies) if latencies else 0,
    }


def print_report_and_evaluate(stats: dict[str, Any], max_p95: float) -> int:
    print("\n" + "=" * 60)
    print("      GATHERLY ENTERPRISE PERFORMANCE & LOAD BENCHMARK      ")
    print("=" * 60)
    print(f"Target Mode:        {stats['mode']}")
    print(f"Total Requests:     {stats['total']}")
    print(f"Concurrency Level:  {stats['concurrency']} virtual workers")
    print(f"Throughput:         {stats['rps']:.1f} requests/sec")
    print(f"Wall Time:          {stats['wall_time_s']:.2f} seconds")
    print(f"Success / Failure:  {stats['successes']} / {stats['failures']}")
    print("-" * 60)
    print(f"Latency Min:        {stats['min_ms']:.2f} ms")
    print(f"Latency Avg:        {stats['avg_ms']:.2f} ms")
    print(f"Latency p50:        {stats['p50_ms']:.2f} ms")
    print(f"Latency p90:        {stats['p90_ms']:.2f} ms")
    print(f"Latency p95:        {stats['p95_ms']:.2f} ms (SLA Limit: <= {max_p95:.1f} ms)")
    print(f"Latency p99:        {stats['p99_ms']:.2f} ms")
    print(f"Latency Max:        {stats['max_ms']:.2f} ms")
    print("=" * 60)

    sla_violations = []
    if stats["failures"] > 0:
        sla_violations.append(f"{stats['failures']} requests failed (0% error rate required).")
    if stats["p95_ms"] > max_p95:
        sla_violations.append(f"p95 latency {stats['p95_ms']:.2f}ms exceeds SLA limit of {max_p95}ms.")

    if sla_violations:
        print("❌ PERFORMANCE SLA FAILED:")
        for v in sla_violations:
            print(f"   - {v}")
        return 1

    print(f"✅ PERFORMANCE SLA PASSED: Sub-{max_p95:.0f}ms p95 with 0 errors.\n")
    return 0


def main():
    parser = argparse.ArgumentParser(description="Gatherly Async Load Tester & SLA Gate")
    parser.add_argument("--url", default="http://localhost:8080", help="Base target URL")
    parser.add_argument("--requests", type=int, default=200, help="Total requests to dispatch")
    parser.add_argument("--concurrency", type=int, default=30, help="Concurrent workers")
    parser.add_argument("--max-p95", type=float, default=150.0, help="Max permissible p95 latency in ms")
    parser.add_argument("--asgi", action="store_true", help="Force in-process ASGITransport")
    args = parser.parse_args()

    use_asgi = args.asgi
    if not use_asgi:
        try:
            with httpx.Client(timeout=0.5) as probe:
                res = probe.get(f"{args.url.rstrip('/')}/api/health")
                if res.status_code != 200:
                    use_asgi = True
        except Exception:
            use_asgi = True

    print(f"Starting load test (Requests={args.requests}, Concurrency={args.concurrency}, ASGI={use_asgi})...")
    stats = asyncio.run(run_load_test(args.url, args.requests, args.concurrency, use_asgi=use_asgi))
    exit_code = print_report_and_evaluate(stats, args.max_p95)
    sys.exit(exit_code)


if __name__ == "__main__":
    main()
