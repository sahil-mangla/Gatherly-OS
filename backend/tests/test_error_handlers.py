"""Validation errors name the failing field but never echo what the client submitted."""

import pytest

from app.api.errors import _safe_errors

SECRET = "hunter2-do-not-leak"


def test_validation_error_does_not_echo_the_submitted_password(client):
    res = client.post(
        "/api/auth/register",
        json={
            "organization_name": "Echo Co",
            "full_name": "Echo Tester",
            "email": "echo@example.com",
            "password": "short",
        },
    )
    assert res.status_code == 422
    assert '"input"' not in res.text
    errors = res.json()["detail"]
    assert errors and all(set(error) <= {"loc", "msg", "type"} for error in errors)
    assert errors[0]["loc"][-1] == "password"


def test_validation_error_body_never_contains_secret_input(client):
    res = client.post("/api/auth/login", json={"email": "not-an-email", "password": SECRET})
    assert res.status_code == 422
    assert SECRET not in res.text
    assert any(error["loc"][-1] == "email" for error in res.json()["detail"])


@pytest.mark.parametrize(
    "error,expected",
    [
        (
            {"loc": ["body", "x"], "msg": "bad", "type": "t", "input": SECRET, "ctx": {"a": 1}},
            {"loc": ["body", "x"], "msg": "bad", "type": "t"},
        ),
        ({"loc": ["query"], "msg": "m"}, {"loc": ["query"], "msg": "m"}),
        ({"input": SECRET}, {}),
    ],
)
def test_safe_errors_keeps_only_where_and_why(error, expected):
    assert _safe_errors([error]) == [expected]
