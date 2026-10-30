"""Python side of the parity suite: Event Risk Radar (including dependency collisions)."""

import pytest

from app.domain.risks import evaluate_event_risks

from .parity_domain_support import assert_parity, load_cases, outcome


def _radar(value):
    return evaluate_event_risks(value["event"], value["ref_date"])


@pytest.mark.parametrize("case", load_cases("risks"))
def test_risk_radar_matches_fixture(case):
    assert_parity(outcome(_radar, case["input"]), case["expected"])
