"""Only 'development' and 'test' are relaxed; every other ENVIRONMENT value is production-like."""

import pytest
from fastapi.testclient import TestClient

from app.config import Settings, is_local_environment, normalise_environment
from app.config import resolve_jwt_secret as resolve

STRONG = "s" * 40
PRODUCTIONISH = [
    "production",
    "Production",
    "PRODUCTION ",
    " prod ",
    "prod",
    "staging",
    "dev",
    "qa",
]


@pytest.fixture
def env(monkeypatch):
    def apply(**values):
        for name, value in values.items():
            if value is None:
                monkeypatch.delenv(name, raising=False)
            else:
                monkeypatch.setenv(name, value)

    apply(ENVIRONMENT=None, VERCEL=None, JWT_SECRET=None, CORS_ORIGINS=None)
    return apply


@pytest.mark.parametrize(
    "raw,expected",
    [("Production", "production"), ("  TEST ", "test"), ("Development\n", "development"), ("", "")],
)
def test_environment_names_are_stripped_and_lowercased(raw, expected):
    assert normalise_environment(raw) == expected


@pytest.mark.parametrize("environment", PRODUCTIONISH)
@pytest.mark.parametrize("secret", [None, "short", "x" * 31])
def test_non_local_environments_refuse_weak_secrets(env, environment, secret):
    env(ENVIRONMENT=environment, JWT_SECRET=secret)
    with pytest.raises(RuntimeError, match="at least 32 bytes"):
        Settings()


def test_capitalised_production_with_a_weak_secret_refuses_to_start(env):
    env(ENVIRONMENT="Production", JWT_SECRET="weak")
    with pytest.raises(RuntimeError, match="JWT_SECRET must be set"):
        Settings()
    with pytest.raises(RuntimeError, match="JWT_SECRET must be set"):
        resolve("Production")


@pytest.mark.parametrize("environment", PRODUCTIONISH)
def test_non_local_environments_fail_closed(env, environment):
    env(ENVIRONMENT=environment, JWT_SECRET=STRONG)
    cfg = Settings()
    assert cfg.environment == environment.strip().lower()
    assert (cfg.is_production, cfg.is_local, cfg.allow_guest) == (True, False, False)
    assert cfg.cors_origins == [] and cfg.cors_allow_credentials is False


@pytest.mark.parametrize(
    "raw,normalised",
    [("development", "development"), ("Development ", "development"), (" TEST", "test")],
)
def test_local_environments_stay_relaxed(env, raw, normalised):
    env(ENVIRONMENT=raw, JWT_SECRET="dev")
    cfg = Settings()
    assert cfg.environment == normalised
    assert (cfg.is_production, cfg.is_local, cfg.allow_guest) == (False, True, True)
    assert cfg.cors_origins == ["*"] and cfg.jwt_secret == "dev"


def test_unset_environment_keeps_current_defaults(env):
    env(JWT_SECRET="dev")
    assert Settings().environment == "development" and Settings().allow_guest
    env(VERCEL="1", JWT_SECRET=STRONG)
    hosted = Settings()
    assert (hosted.environment, hosted.is_production, hosted.allow_guest) == (
        "production",
        True,
        False,
    )


def test_blank_environment_counts_as_unset(env):
    env(ENVIRONMENT="   ", JWT_SECRET="dev")
    assert Settings().environment == "development"
    env(ENVIRONMENT="   ", VERCEL="1", JWT_SECRET=STRONG)
    assert Settings().environment == "production"


def test_a_typo_on_vercel_boots_with_a_generated_secret_but_stays_strict(env):
    env(ENVIRONMENT="prod", VERCEL="1", JWT_SECRET="weak")
    cfg = Settings()
    assert cfg.jwt_secret != "weak" and len(cfg.jwt_secret) >= 32
    assert cfg.is_production and not cfg.allow_guest


def test_constructing_settings_with_an_odd_name_normalises_it(env):
    env(JWT_SECRET=STRONG)
    assert Settings(environment=" Production ").environment == "production"
    assert Settings(environment="Test").is_local


def test_is_local_environment_only_accepts_development_and_test():
    assert [
        is_local_environment(n) for n in ("Development", "TEST ", "production", "prod", "")
    ] == [
        True,
        True,
        False,
        False,
        False,
    ]


def test_a_typoed_environment_serves_the_app_like_production(build_app):
    app = TestClient(build_app(environment="Prod "))  # un-normalised on purpose
    assert app.get("/docs").status_code == 404
    health = app.get("/api/health")
    assert health.headers["strict-transport-security"] == "max-age=31536000; includeSubDomains"
    assert app.get("/api/auth/me").status_code == 401
