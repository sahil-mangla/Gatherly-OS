"""Tests for timeline scheduling, DAG cycle detection, and rescheduling preview."""

import pytest

from app.domain.timeline import (
    calculate_timeline_progress,
    check_circular_dependencies,
    evaluate_reschedule,
    validate_task,
)


@pytest.fixture
def sample_tasks():
    return [
        {
            "id": "t1",
            "title": "Confirm venue",
            "due_date": "2025-06-01",
            "status": "done",
            "priority": "critical",
            "depends_on": [],
            "is_fixed_deadline": True,
        },
        {
            "id": "t2",
            "title": "Finalize capacity",
            "due_date": "2025-06-10",
            "status": "in_progress",
            "priority": "high",
            "depends_on": ["t1"],
            "is_fixed_deadline": False,
        },
        {
            "id": "t3",
            "title": "Confirm catering menu",
            "due_date": "2025-06-20",
            "status": "todo",
            "priority": "high",
            "depends_on": ["t2"],
            "is_fixed_deadline": False,
        },
        {
            "id": "t4",
            "title": "Mail invitations",
            "due_date": "2025-07-01",
            "status": "todo",
            "priority": "critical",
            "depends_on": ["t3"],
            "is_fixed_deadline": True,
        },
    ]


def test_task_validation():
    valid, errors = validate_task(
        {
            "title": "Order invitations",
            "due_date": "2025-06-15",
            "priority": "high",
            "status": "todo",
        }
    )
    assert valid is True
    assert len(errors) == 0

    invalid, errs = validate_task(
        {
            "title": "",
            "due_date": "invalid-date",
            "priority": "extreme",
        }
    )
    assert invalid is False
    assert any("title is required" in e.lower() for e in errs)
    assert any("valid due_date" in e.lower() for e in errs)
    assert any("invalid priority" in e.lower() for e in errs)


def test_dag_cycle_detection(sample_tasks):
    has_cycle, _ = check_circular_dependencies(sample_tasks)
    assert has_cycle is False

    cyclic = [
        {"id": "a", "depends_on": ["b"]},
        {"id": "b", "depends_on": ["c"]},
        {"id": "c", "depends_on": ["a"]},
    ]
    has_cycle_2, cycle_nodes = check_circular_dependencies(cyclic)
    assert has_cycle_2 is True
    assert len(cycle_nodes) > 0


def test_timeline_progress_and_overdue(sample_tasks):
    # As of 2025-06-15, t2 due 2025-06-10 is overdue
    progress = calculate_timeline_progress(sample_tasks, "2025-06-15")
    assert progress["total"] == 4
    assert progress["completed"] == 1
    assert progress["percent_complete"] == 25
    assert len(progress["overdue_tasks"]) == 1
    assert progress["overdue_tasks"][0]["id"] == "t2"
    assert progress["next_task"]["id"] == "t3"


def test_evaluate_reschedule_detects_collision(sample_tasks):
    # Shifting t2 from June 10 to June 25 violates prerequisite for t3 (due June 20)
    preview = evaluate_reschedule(sample_tasks, "t2", "2025-06-25")
    assert preview["has_conflicts"] is True
    assert any(c["dependent_id"] == "t3" for c in preview["conflicts"])
    assert preview["impacted_dependents_count"] == 2
