"""Python side of the Python-vs-JS parity suite: budget, expenses and the ripple simulation."""

import pytest

from app.domain.budget import calculate_budget_summary, validate_expense_input
from app.domain.simulation import simulate_ripple

from .parity_domain_support import assert_parity, load_cases, outcome


def _validation(item):
    valid, errors = validate_expense_input(item)
    return {"valid": valid, "errors": errors}


def _ripple(value):
    return simulate_ripple(value["event"], value["deltas"])


@pytest.mark.parametrize("case", load_cases("budget"))
def test_budget_summary_matches_fixture(case):
    assert_parity(outcome(calculate_budget_summary, case["input"]), case["expected"])


@pytest.mark.parametrize("case", load_cases("expense"))
def test_expense_validation_matches_fixture(case):
    assert_parity(outcome(_validation, case["input"]), case["expected"])


@pytest.mark.parametrize("case", load_cases("simulation"))
def test_simulate_ripple_matches_fixture(case):
    assert_parity(outcome(_ripple, case["input"]), case["expected"])
