"""High-throughput async load testing harness with automated SLA gating."""

import argparse
import asyncio
import os
import sys
import time
from typing import Any

import httpx
from load_stats import print_report_and_evaluate, summarize

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# The synthetic load deliberately exceeds production rate limits; this only affects the
# in-process (--asgi) app. Against a live server, run it with RATE_LIMIT_ENABLED=false.
os.environ.setdefault("RATE_LIMIT_ENABLED", "false")
os.environ.setdefault("ENVIRONMENT", "test")

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
            {
                "id": "m1",
                "title": "Deposit Due",
                "date": "2026-06-01",
                "completed": False,
            }
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
        {
            "text": "Catering quote: $65/person for 120 guests. Deposit 30%. Excludes cleanup fee."
        },
    ),
]


async def fetch_demo_token(client: httpx.AsyncClient, base_url: str) -> dict[str, str]:
    """Obtain a sandbox bearer token; the compute endpoints require authentication."""
    res = await client.get(
        f"{base_url.rstrip('/')}/api/auth/demo-token?role=planner", timeout=5.0
    )
    res.raise_for_status()
    return {"Authorization": f"Bearer {res.json()['access_token']}"}


async def execute_request(
    client: httpx.AsyncClient, base_url: str, idx: int, headers: dict[str, str]
) -> tuple[float, bool]:
    method, path, body = TARGET_SCENARIOS[idx % len(TARGET_SCENARIOS)]
    url = f"{base_url.rstrip('/')}{path}"
    start = time.perf_counter()
    try:
        if method == "GET":
            res = await client.get(url, headers=headers, timeout=5.0)
        else:
            res = await client.post(url, json=body, headers=headers, timeout=5.0)
        elapsed_ms = (time.perf_counter() - start) * 1000.0
        return elapsed_ms, res.status_code in (200, 201)
    except Exception:  # noqa: BLE001 - any failure is a failed request, never a crashed load run
        elapsed_ms = (time.perf_counter() - start) * 1000.0
        return elapsed_ms, False


def make_client(
    base_url: str, concurrency: int, use_asgi: bool
) -> tuple[httpx.AsyncClient, str]:
    """Build the HTTP client (in-process ASGI or real sockets) and its target base URL."""
    if use_asgi:
        if REPO_ROOT not in sys.path:
            sys.path.insert(0, REPO_ROOT)
        from backend.app.main import app

        transport = httpx.ASGITransport(app=app)
        client = httpx.AsyncClient(transport=transport, base_url="http://testserver")
        return client, "http://testserver"
    limits = httpx.Limits(
        max_keepalive_connections=concurrency, max_connections=concurrency * 2
    )
    return httpx.AsyncClient(limits=limits), base_url


async def run_load_test(
    base_url: str, total_reqs: int, concurrency: int, use_asgi: bool = False
) -> dict[str, Any]:
    sem = asyncio.Semaphore(concurrency)
    results: list[tuple[float, bool]] = []
    client, target_base = make_client(base_url, concurrency, use_asgi)

    async with client:
        headers = await fetch_demo_token(client, target_base)

        async def worker(idx: int):
            async with sem:
                results.append(await execute_request(client, target_base, idx, headers))

        wall_start = time.perf_counter()
        await asyncio.gather(*(worker(i) for i in range(total_reqs)))
        wall_elapsed = time.perf_counter() - wall_start

    stats = summarize(results, wall_elapsed)
    stats["concurrency"] = concurrency
    stats["mode"] = "in-process (ASGI)" if use_asgi else f"socket ({base_url})"
    return stats


def main():
    parser = argparse.ArgumentParser(
        description="Gatherly Async Load Tester & SLA Gate"
    )
    parser.add_argument(
        "--url", default="http://localhost:8080", help="Base target URL"
    )
    parser.add_argument(
        "--requests", type=int, default=200, help="Total requests to dispatch"
    )
    parser.add_argument(
        "--concurrency", type=int, default=30, help="Concurrent workers"
    )
    parser.add_argument(
        "--max-p95", type=float, default=150.0, help="Max permissible p95 latency in ms"
    )
    parser.add_argument(
        "--asgi", action="store_true", help="Force in-process ASGITransport"
    )
    args = parser.parse_args()

    use_asgi = args.asgi
    if not use_asgi:
        try:
            with httpx.Client(timeout=0.5) as probe:
                res = probe.get(f"{args.url.rstrip('/')}/api/health")
                if res.status_code != 200:
                    use_asgi = True
        except httpx.HTTPError:
            use_asgi = True

    print(
        f"Starting load test (Requests={args.requests}, Concurrency={args.concurrency}, ASGI={use_asgi})..."
    )
    stats = asyncio.run(
        run_load_test(args.url, args.requests, args.concurrency, use_asgi=use_asgi)
    )
    exit_code = print_report_and_evaluate(stats, args.max_p95)
    sys.exit(exit_code)


if __name__ == "__main__":
    main()
