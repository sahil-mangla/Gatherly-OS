"""ASGI-level behaviour of the body-size and security-header middleware."""

import asyncio

import pytest

from app.api.middleware import (
    BodySizeLimitMiddleware,
    SecurityHeadersMiddleware,
    _BodyTooLargeError,
)


async def _ok_app(scope, receive, send):
    await send({"type": "http.response.start", "status": 204, "headers": []})
    await send({"type": "http.response.body", "body": b""})


@pytest.mark.parametrize("wrapper", [BodySizeLimitMiddleware, SecurityHeadersMiddleware])
@pytest.mark.parametrize("scope_type", ["lifespan", "websocket"])
def test_non_http_scopes_pass_through_untouched(wrapper, scope_type):
    seen = []

    async def inner(scope, receive, send):
        seen.append(scope["type"])

    asyncio.run(wrapper(inner)({"type": scope_type}, None, None))
    assert seen == [scope_type]


def test_too_large_body_after_response_started_propagates():
    sent = []

    async def inner(scope, receive, send):
        await send({"type": "http.response.start", "status": 200, "headers": []})
        await receive()

    async def receive():
        return {"type": "http.request", "body": b"x" * 20, "more_body": False}

    async def send(message):
        sent.append(message["type"])

    middleware = BodySizeLimitMiddleware(inner, max_bytes=10)
    with pytest.raises(_BodyTooLargeError):
        asyncio.run(middleware({"type": "http", "headers": []}, receive, send))
    assert sent == ["http.response.start"]


def test_non_numeric_content_length_falls_back_to_streaming_count():
    sent = []

    async def send(message):
        sent.append(message)

    async def receive():
        return {"type": "http.request", "body": b"abc", "more_body": False}

    scope = {"type": "http", "headers": [(b"content-length", b"abc")]}
    asyncio.run(BodySizeLimitMiddleware(_ok_app, max_bytes=10)(scope, receive, send))
    assert sent[0]["status"] == 204


def test_streaming_overflow_before_any_response_becomes_a_413():
    sent = []

    async def inner(scope, receive, send):
        await receive()

    async def receive():
        return {"type": "http.request", "body": b"x" * 20, "more_body": False}

    async def send(message):
        sent.append(message)

    asyncio.run(
        BodySizeLimitMiddleware(inner, max_bytes=10)({"type": "http", "headers": []}, receive, send)
    )
    assert sent[0]["status"] == 413
    assert sent[1]["body"] == b'{"detail": "Request body too large."}'


def test_declared_content_length_over_the_limit_never_reaches_the_app():
    sent = []
    reached = []

    async def inner(scope, receive, send):
        reached.append(True)

    async def send(message):
        sent.append(message)

    scope = {"type": "http", "headers": [(b"content-length", b"11")]}
    asyncio.run(BodySizeLimitMiddleware(inner, max_bytes=10)(scope, None, send))
    assert reached == [] and sent[0]["status"] == 413
