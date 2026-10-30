"""Error handlers that keep response bodies free of submitted values."""

from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

SAFE_ERROR_KEYS = ("loc", "msg", "type")


def _safe_errors(errors: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Keep only where/why a field failed; drop ``input`` and ``ctx`` (they echo user data)."""
    return [{key: error[key] for key in SAFE_ERROR_KEYS if key in error} for error in errors]


async def validation_error_handler(_request: Request, exc: RequestValidationError) -> JSONResponse:
    """422 response that names the invalid fields without echoing what was submitted."""
    return JSONResponse(status_code=422, content={"detail": _safe_errors(exc.errors())})


def register_error_handlers(app: FastAPI) -> None:
    """Install the shared exception handlers on the application."""
    app.add_exception_handler(RequestValidationError, validation_error_handler)
