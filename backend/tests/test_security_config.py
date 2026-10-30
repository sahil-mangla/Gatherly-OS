"""Configuration hardening: JWT secret policy, environment defaults, CORS defaults, DB args."""

import logging
import os

import pytest

from app.config import Settings, _default_cors_origins, _default_environment
from app.config import resolve_jwt_secret as resolve

PUBLIC_DEFAULT = "gatherly-super-secure-enterprise-secret-32-chars"
STRONG = "s" * 40


@pytest.fixture
def env(monkeypatch):
    """Return ``set(**vars)``; ``None`` deletes. Everything is restored after the test."""

    def apply(**values):
        for name, value in values.items():
            if value is None:
                monkeypatch.delenv(name, raising=False)
            else:
                monkeypatch.setenv(name, value)

    apply(ENVIRONMENT=None, VERCEL=None, JWT_SECRET=None, CORS_ORIGINS=None)
    return apply


@pytest.mark.parametrize("secret", [None, "", "short", PUBLIC_DEFAULT, "x" * 31])
def test_production_refuses_missing_weak_or_public_secrets(env, secret):
    env(JWT_SECRET=secret)
    with pytest.raises(RuntimeError, match="JWT_SECRET must be set"):
        resolve("production")


def test_production_accepts_a_strong_secret_unchanged(env):
    env(JWT_SECRET=STRONG)
    assert resolve("production") == STRONG


def test_32_byte_boundary_is_strong_enough(env):
    env(JWT_SECRET="b" * 32)
    assert resolve("production") == "b" * 32


@pytest.mark.parametrize("secret", [None, "short", PUBLIC_DEFAULT])
def test_vercel_production_boots_with_a_random_exported_secret(env, caplog, secret):
    env(VERCEL="1", JWT_SECRET=secret)
    with caplog.at_level(logging.WARNING, logger="gatherly.config"):
        generated = resolve("production")
    assert generated not in (secret, PUBLIC_DEFAULT)
    assert len(generated.encode()) >= 32
    assert os.environ["JWT_SECRET"] == generated
    assert "random per-instance secret" in caplog.text
    assert generated not in caplog.text


def test_vercel_instances_sharing_the_environment_share_one_key(env):
    env(VERCEL="1")
    first = resolve("production")
    assert resolve("production") == first


@pytest.mark.parametrize("environment", ["development", "test"])
def test_non_production_accepts_short_secrets_but_never_the_public_default(env, environment):
    env(JWT_SECRET="dev")
    assert resolve(environment) == "dev"
    env(JWT_SECRET=PUBLIC_DEFAULT)
    replaced = resolve(environment)
    assert replaced != PUBLIC_DEFAULT and len(replaced) >= 32


def test_non_production_without_secret_generates_one(env):
    first = resolve("development")
    assert len(first) >= 32 and os.environ["JWT_SECRET"] == first


def test_settings_construction_fails_fast_in_production_without_secret(env):
    env(ENVIRONMENT="production")
    with pytest.raises(RuntimeError, match="at least 32 bytes"):
        Settings()


def test_settings_on_vercel_default_to_production_with_safe_defaults(env):
    env(VERCEL="1", TRUST_PROXY=None, DATABASE_URL=None)
    cfg = Settings()
    assert cfg.is_production and not cfg.allow_guest
    assert cfg.trust_proxy is True
    assert cfg.database_url == "sqlite:////tmp/gatherly.db"
    assert cfg.cors_origins == [] and cfg.cors_allow_credentials is False
    assert cfg.jwt_secret != PUBLIC_DEFAULT


@pytest.mark.parametrize(
    "environment,production,guest",
    [
        ("production", True, False),
        ("development", False, True),
        ("test", False, True),
        ("staging", False, False),
    ],
)
def test_guest_access_is_limited_to_dev_and_test(env, environment, production, guest):
    env(ENVIRONMENT=environment, JWT_SECRET=STRONG)
    cfg = Settings()
    assert (cfg.is_production, cfg.allow_guest) == (production, guest)


def test_explicit_environment_beats_vercel_detection(env):
    env(VERCEL="1", ENVIRONMENT="development")
    assert _default_environment() == "development"
    env(ENVIRONMENT=None, VERCEL=None)
    assert _default_environment() == "development"


def test_jwt_algorithm_is_fixed_and_not_configurable(env):
    env(JWT_ALGORITHM="none", JWT_SECRET=STRONG)
    assert Settings().jwt_algorithm == "HS256"


@pytest.mark.parametrize(
    "environment,raw,expected",
    [
        ("production", None, []),
        ("development", None, ["*"]),
        (
            "production",
            " https://a.example , https://b.example,, ",
            ["https://a.example", "https://b.example"],
        ),
        ("development", "https://only.example", ["https://only.example"]),
    ],
)
def test_cors_origin_defaults(env, environment, raw, expected):
    env(ENVIRONMENT=environment, CORS_ORIGINS=raw)
    assert _default_cors_origins() == expected


@pytest.mark.parametrize(
    "origins,credentials",
    [
        ([], False),
        (["*"], False),
        (["https://a.example", "*"], False),
        (["https://a.example"], True),
    ],
)
def test_credentials_are_never_combined_with_wildcard(settings, monkeypatch, origins, credentials):
    monkeypatch.setattr(settings, "cors_origins", origins)
    assert settings.cors_allow_credentials is credentials
