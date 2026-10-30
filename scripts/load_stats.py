"""Latency statistics and SLA evaluation helpers for the Gatherly load test."""

import statistics
from typing import Any


def percentile(sorted_values: list[float], p: float) -> float:
    if not sorted_values:
        return 0.0
    k = (len(sorted_values) - 1) * (p / 100.0)
    f = int(k)
    c = min(f + 1, len(sorted_values) - 1)
    return sorted_values[f] + (k - f) * (sorted_values[c] - sorted_values[f])


def summarize(results: list[tuple[float, bool]], wall_elapsed: float) -> dict[str, Any]:
    latencies = sorted(r[0] for r in results)
    successes = sum(1 for r in results if r[1])
    return {
        "total": len(results),
        "wall_time_s": wall_elapsed,
        "rps": len(results) / wall_elapsed if wall_elapsed > 0 else 0,
        "successes": successes,
        "failures": len(results) - successes,
        "min_ms": latencies[0] if latencies else 0,
        "avg_ms": statistics.mean(latencies) if latencies else 0,
        "p50_ms": percentile(latencies, 50),
        "p90_ms": percentile(latencies, 90),
        "p95_ms": percentile(latencies, 95),
        "p99_ms": percentile(latencies, 99),
        "max_ms": latencies[-1] if latencies else 0,
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
    print(
        f"Latency p95:        {stats['p95_ms']:.2f} ms (SLA Limit: <= {max_p95:.1f} ms)"
    )
    print(f"Latency p99:        {stats['p99_ms']:.2f} ms")
    print(f"Latency Max:        {stats['max_ms']:.2f} ms")
    print("=" * 60)

    sla_violations = []
    if stats["failures"] > 0:
        sla_violations.append(
            f"{stats['failures']} requests failed (0% error rate required)."
        )
    if stats["p95_ms"] > max_p95:
        sla_violations.append(
            f"p95 latency {stats['p95_ms']:.2f}ms exceeds SLA limit of {max_p95}ms."
        )

    if sla_violations:
        print("❌ PERFORMANCE SLA FAILED:")
        for v in sla_violations:
            print(f"   - {v}")
        return 1

    print(f"✅ PERFORMANCE SLA PASSED: Sub-{max_p95:.0f}ms p95 with 0 errors.\n")
    return 0
