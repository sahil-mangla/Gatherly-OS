"""Parity proof: the Python quote extractor must agree with the shared JSON fixtures.

The identical fixtures are asserted by frontend/tests/parity-quotes.test.js against the JS twin.
"""

import json
from pathlib import Path

import pytest

from app.domain.vendors import extract_quote_from_raw_text

FIXTURE = Path(__file__).resolve().parents[2] / "shared" / "parity" / "quotes.json"
CASES = json.loads(FIXTURE.read_text(encoding="utf-8"))
MONEY_TOLERANCE = 0.01


def _text(case):
    if "text" in case:
        return case["text"]
    tpl = case["text_template"]
    return tpl["prefix"] + tpl["unit"] * tpl["count"] + tpl["suffix"]


def _fees(fees):
    return [{k: fee[k] for k in ("type", "unit", "rate", "amount")} for fee in fees]


def test_fixture_is_substantial_and_compact():
    assert len(CASES) >= 30
    assert len({case["name"] for case in CASES}) == len(CASES)
    assert FIXTURE.stat().st_size < 60_000


@pytest.mark.parametrize("case", CASES, ids=[c["name"] for c in CASES])
def test_extraction_matches_shared_fixture(case):
    got = extract_quote_from_raw_text(_text(case))
    want = case["expected"]
    assert got["vendor_name"] == want["vendor_name"]
    assert got["service_type"] == want["service_type"]
    assert got["quoted_base_amount"] == pytest.approx(want["base_amount"], abs=MONEY_TOLERANCE)
    assert got["deposit_amount"] == pytest.approx(want["deposit_amount"], abs=MONEY_TOLERANCE)
    assert got["deposit_stated"] is want["deposit_stated"]
    assert got["flags"] == want["flags"]
    assert got["missing_fields"] == want["missing_fields"]
    assert _fees(got["hidden_fees"]) == [
        {
            **fee,
            "rate": pytest.approx(fee["rate"]),
            "amount": pytest.approx(fee["amount"], abs=MONEY_TOLERANCE),
        }
        for fee in want["hidden_fees"]
    ]
