"""Helpers for the cross-language parity suite (fixtures live in ``shared/parity``)."""

import json
import math
from pathlib import Path
from typing import Any

import pytest

FIXTURE_DIR = Path(__file__).resolve().parents[2] / "shared" / "parity"
FLOAT_TOLERANCE = 0.01


def load_cases(name: str) -> list[Any]:
    """Parametrized pytest cases for ``shared/parity/<name>.json``."""
    data = json.loads((FIXTURE_DIR / f"{name}.json").read_text(encoding="utf-8"))
    return [pytest.param(case, id=case["name"]) for case in data["cases"]]


def outcome(fn, value: Any) -> Any:
    """Run ``fn(value)`` on a deep copy; an exception becomes the fixture's error marker."""
    try:
        return fn(json.loads(json.dumps(value)))
    except Exception:
        return {"error": True}


def _assert_number(actual: Any, expected: float, path: str) -> None:
    assert isinstance(actual, int | float) and not isinstance(actual, bool), path
    assert math.isclose(actual, expected, abs_tol=FLOAT_TOLERANCE), (
        f"{path}: {actual} != {expected}"
    )


def _assert_mapping(actual: Any, expected: dict, path: str) -> None:
    assert isinstance(actual, dict), path
    assert sorted(actual) == sorted(expected), f"{path}: keys differ"
    for key, value in expected.items():
        assert_parity(actual[key], value, f"{path}.{key}")


def _assert_sequence(actual: Any, expected: list, path: str) -> None:
    assert isinstance(actual, list), path
    assert len(actual) == len(expected), f"{path}: length {len(actual)} != {len(expected)}"
    for index, value in enumerate(expected):
        assert_parity(actual[index], value, f"{path}[{index}]")


def assert_parity(actual: Any, expected: Any, path: str = "$") -> None:
    """Deep-compare: floats within 0.01, dict key sets and list lengths exactly."""
    actual = json.loads(json.dumps(actual)) if path == "$" else actual
    if isinstance(expected, bool) or expected is None or isinstance(expected, str):
        assert actual == expected and type(actual) is type(expected), (
            f"{path}: {actual!r} != {expected!r}"
        )
    elif isinstance(expected, int | float):
        _assert_number(actual, expected, path)
    elif isinstance(expected, dict):
        _assert_mapping(actual, expected, path)
    else:
        _assert_sequence(actual, expected, path)
