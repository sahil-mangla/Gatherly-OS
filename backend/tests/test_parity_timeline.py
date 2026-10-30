"""Python side of the parity suite: progress, task validation, cycles and rescheduling."""

import pytest

from app.domain.timeline import (
    calculate_timeline_progress,
    check_circular_dependencies,
    evaluate_reschedule,
    validate_task,
)

from .parity_domain_support import assert_parity, load_cases, outcome


def _progress(value):
    return calculate_timeline_progress(value["tasks"], value["ref_date"])


def _validation(task):
    valid, errors = validate_task(task)
    return {"valid": valid, "errors": errors}


def _cycles(tasks):
    has_cycle, path = check_circular_dependencies(tasks)
    return {"has_cycle": has_cycle, "path": path}


def _reschedule(value):
    return evaluate_reschedule(value["tasks"], value["task_id"], value["new_date"])


@pytest.mark.parametrize("case", load_cases("progress"))
def test_timeline_progress_matches_fixture(case):
    assert_parity(outcome(_progress, case["input"]), case["expected"])


@pytest.mark.parametrize("case", load_cases("tasks"))
def test_task_validation_matches_fixture(case):
    assert_parity(outcome(_validation, case["input"]), case["expected"])


@pytest.mark.parametrize("case", load_cases("cycles"))
def test_circular_dependencies_match_fixture(case):
    assert_parity(outcome(_cycles, case["input"]), case["expected"])


@pytest.mark.parametrize("case", load_cases("reschedule"))
def test_reschedule_matches_fixture(case):
    assert_parity(outcome(_reschedule, case["input"]), case["expected"])
