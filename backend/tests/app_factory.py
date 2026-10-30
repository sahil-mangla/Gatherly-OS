"""Fixture that rebuilds the FastAPI app under different settings and restores it afterwards."""

import importlib

import pytest


@pytest.fixture
def build_app(monkeypatch, settings):
    """Return ``build(**settings_overrides)``: a freshly assembled app (docs, CORS are import-time)."""
    import app.main as main_module

    def build(**overrides):
        for name, value in overrides.items():
            monkeypatch.setattr(settings, name, value)
        return importlib.reload(main_module).app

    yield build
    monkeypatch.undo()
    importlib.reload(main_module)
