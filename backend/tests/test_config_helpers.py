"""Config helpers: boolean flags and per-platform database engine arguments."""

import pytest

from app.config import _flag
from app.db.database import get_engine_args


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("1", True),
        ("TRUE", True),
        (" yes ", True),
        ("on", True),
        ("0", False),
        ("no", False),
        ("", False),
    ],
)
def test_flag_parsing(monkeypatch, raw, expected):
    monkeypatch.setenv("SOME_FLAG", raw)
    assert _flag("SOME_FLAG", "false") is expected


def test_flag_default_applies_when_unset(monkeypatch):
    monkeypatch.delenv("SOME_FLAG", raising=False)
    assert _flag("SOME_FLAG", "true") is True


@pytest.mark.parametrize(
    "url,vercel,expected",
    [
        (
            "sqlite:///:memory:",
            False,
            {"connect_args": {"check_same_thread": False}, "poolclass": "StaticPool"},
        ),
        ("sqlite:///x.db", False, {"connect_args": {"check_same_thread": False}}),
        (
            "sqlite:////tmp/x.db",
            True,
            {"connect_args": {"check_same_thread": False}, "poolclass": "NullPool"},
        ),
        ("postgresql://u@h/db", True, {"poolclass": "NullPool", "pool_pre_ping": True}),
        (
            "postgresql://u@h/db",
            False,
            {"pool_size": 5, "max_overflow": 5, "pool_pre_ping": True, "pool_recycle": 1800},
        ),
    ],
)
def test_engine_args_per_platform(settings, monkeypatch, url, vercel, expected):
    monkeypatch.setattr(settings, "on_vercel", vercel)
    monkeypatch.delenv("DB_POOL_SIZE", raising=False)
    monkeypatch.delenv("DB_MAX_OVERFLOW", raising=False)
    args = get_engine_args(url)
    if "poolclass" in args:
        args["poolclass"] = args["poolclass"].__name__
    assert args == expected
