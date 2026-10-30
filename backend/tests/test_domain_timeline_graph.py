"""Dependency-graph edge cases, scale and performance guards for the timeline domain."""

import time

import pytest

from app.domain.timeline import (
    calculate_timeline_progress,
    check_circular_dependencies,
    evaluate_reschedule,
    validate_task,
)
from app.domain.timeline_dates import parse_date


def _chain(n: int) -> list[dict]:
    return [
        {
            "id": f"t{i}",
            "title": f"Task {i}",
            "due_date": "2025-06-10",
            "depends_on": [f"t{i - 1}"] if i else [],
        }
        for i in range(n)
    ]


def test_self_dependency_is_a_cycle():
    has_cycle, path = check_circular_dependencies([{"id": "a", "depends_on": ["a"]}])
    assert has_cycle is True
    assert path == ["a", "a"]


def test_missing_dependency_id_is_ignored():
    assert check_circular_dependencies([{"id": "a", "depends_on": ["ghost"]}]) == (False, [])


def test_three_node_cycle_reports_path_ending_at_repeat():
    tasks = [
        {"id": "a", "depends_on": ["b"]},
        {"id": "b", "depends_on": ["c"]},
        {"id": "c", "depends_on": ["a"]},
    ]
    has_cycle, path = check_circular_dependencies(tasks)
    assert has_cycle is True
    assert path == ["a", "b", "c", "a"]


def test_diamond_is_not_a_cycle():
    tasks = [
        {"id": "a", "depends_on": []},
        {"id": "b", "depends_on": ["a"]},
        {"id": "c", "depends_on": ["a"]},
        {"id": "d", "depends_on": ["b", "c"]},
    ]
    assert check_circular_dependencies(tasks) == (False, [])


def test_malformed_dependency_shapes_are_tolerated():
    tasks = [{"id": "a", "depends_on": "b"}, {"id": "b"}, "junk", {"title": "no id"}]
    assert check_circular_dependencies(tasks) == (False, [])


def test_5000_task_chain_is_fast():
    tasks = _chain(5000)
    start = time.perf_counter()
    assert check_circular_dependencies(tasks) == (False, [])
    result = evaluate_reschedule(tasks, "t0", "2025-06-20")
    elapsed = time.perf_counter() - start
    assert result["impacted_dependents_count"] == 4999
    assert elapsed < 1.0, f"5k-task graph took {elapsed:.2f}s"


def test_deep_chain_does_not_hit_recursion_limit():
    tasks = _chain(2500)
    assert check_circular_dependencies(tasks) == (False, [])
    tasks[0]["depends_on"] = ["t2499"]  # close the loop at the far end
    has_cycle, path = check_circular_dependencies(tasks)
    assert has_cycle is True
    assert len(path) == 2501 and path[0] == path[-1] == "t0"


def test_reschedule_wide_fanout_is_linear():
    tasks = [{"id": "root", "title": "Root", "due_date": "2025-06-01"}]
    tasks += [
        {"id": f"c{i}", "title": f"C{i}", "due_date": "2025-06-05", "depends_on": ["root"]}
        for i in range(3000)
    ]
    start = time.perf_counter()
    res = evaluate_reschedule(tasks, "root", "2025-06-10")
    assert time.perf_counter() - start < 1.0
    assert len(res["conflicts"]) == 3000


def test_reschedule_errors():
    with pytest.raises(ValueError, match="not found"):
        evaluate_reschedule(_chain(2), "nope", "2025-06-10")
    with pytest.raises(ValueError, match="Invalid target date"):
        evaluate_reschedule(_chain(2), "t0", "garbage")


def test_reschedule_fixed_deadline_and_critical_dependent():
    tasks = [
        {"id": "a", "title": "A", "due_date": "2025-06-01", "is_fixed_deadline": True},
        {
            "id": "b",
            "title": "B",
            "due_date": "2025-06-05",
            "depends_on": ["a", "a"],
            "is_fixed_deadline": True,
        },
        {"id": "c", "title": "C", "due_date": "bad", "depends_on": ["b"]},
        {"id": "d", "title": "D", "due_date": "2025-12-01", "depends_on": ["c"]},
    ]
    res = evaluate_reschedule(tasks, "a", "2025-06-10")
    kinds = [c["type"] for c in res["conflicts"]]
    assert kinds == ["fixed_deadline_override", "dependency_precedence_violation"]
    assert res["conflicts"][1]["severity"] == "critical"
    assert [d["id"] for d in res["impacted_dependents"]] == ["b", "c", "d"]


def test_reschedule_survives_cycles_and_reports_each_dependent_once():
    tasks = [
        {"id": "a", "title": "A", "due_date": "2025-06-01", "depends_on": ["b"]},
        {"id": "b", "title": "B", "due_date": "2025-06-02", "depends_on": ["a"]},
    ]
    res = evaluate_reschedule(tasks, "a", "2025-06-10")
    assert [d["id"] for d in res["impacted_dependents"]] == ["b", "a"]


def test_validate_task_branches():
    assert validate_task("x") == (False, ["Task must be a dictionary."])
    ok, errs = validate_task({"title": "t", "due_date": "2025-01-01", "status": "weird"})
    assert ok is False and errs == ["Invalid status 'weird'. Allowed: todo, in_progress, done"]
    ok, errs = validate_task({"title": 5})
    assert errs == ["Task title is required.", "Valid due_date in YYYY-MM-DD format is required."]
    assert validate_task({"title": "t", "due_date": "2025-01-01"}) == (True, [])


def test_progress_ref_date_fallbacks_and_counts():
    tasks = [
        {"id": "1", "status": "done", "due_date": "2000-01-01"},
        {"id": "2", "status": "in_progress", "due_date": "2000-01-01"},
        {"id": "3", "due_date": "not-a-date"},
        {"id": "4", "status": "todo", "due_date": "2999-01-01"},
        "junk",
    ]
    for bad_ref in (None, "garbage"):
        res = calculate_timeline_progress(tasks, bad_ref)
        assert (res["completed"], res["in_progress"], res["todo"]) == (1, 1, 2)
        assert [t["id"] for t in res["overdue_tasks"]] == ["2"]
        assert res["next_task"]["id"] == "4"
    assert res["total"] == 5
    assert res["percent_complete"] == 20


def test_progress_empty():
    res = calculate_timeline_progress([], "2025-01-01")
    assert res["percent_complete"] == 0 and res["next_task"] is None


def test_parse_date_variants():
    assert parse_date("2025-06-01T10:00:00").isoformat() == "2025-06-01"
    assert parse_date("nope") is None
    assert parse_date(None) is None  # type: ignore[arg-type]
