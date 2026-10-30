"""Pure-ASGI middleware: request body size cap and security response headers."""

import json

from fastapi import HTTPException
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from ..config import settings

CSP = (
    "default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
    "font-src https://fonts.gstatic.com; img-src 'self' data:; script-src 'self'; "
    "connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
)
HSTS = "max-age=31536000; includeSubDomains"
STATIC_SECURITY_HEADERS = {
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "strict-origin-when-cross-origin",
    "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=()",
}
DOC_PATHS = ("/docs", "/redoc")  # Swagger UI needs inline scripts and a CDN; dev only


class _BodyTooLargeError(HTTPException):
    """Raised from ``receive`` once a request body exceeds the configured limit.

    It is an ``HTTPException`` so FastAPI's body parsing re-raises it (answering 413) instead of
    wrapping it in a generic 400 "error parsing the body".
    """

    def __init__(self) -> None:
        super().__init__(status_code=413, detail="Request body too large.")


def _header(scope: Scope, name: bytes) -> str | None:
    for key, value in scope.get("headers", []):
        if key == name:
            return value.decode("latin-1")
    return None


async def _send_json(send: Send, status: int, detail: str) -> None:
    body = json.dumps({"detail": detail}).encode()
    headers = [(b"content-type", b"application/json"), (b"content-length", str(len(body)).encode())]
    await send({"type": "http.response.start", "status": status, "headers": headers})
    await send({"type": "http.response.body", "body": body})


class BodySizeLimitMiddleware:
    """Rejects request bodies above ``max_bytes`` with 413, even for chunked uploads."""

    def __init__(self, app: ASGIApp, max_bytes: int | None = None):
        self.app = app
        self.max_bytes = max_bytes or settings.max_body_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        declared = _header(scope, b"content-length")
        if declared and declared.isdigit() and int(declared) > self.max_bytes:
            await _send_json(send, 413, "Request body too large.")
            return

        received = 0
        started = False

        async def limited_receive() -> Message:
            nonlocal received
            message = await receive()
            received += len(message.get("body", b"")) if message["type"] == "http.request" else 0
            if received > self.max_bytes:
                raise _BodyTooLargeError
            return message

        async def tracking_send(message: Message) -> None:
            nonlocal started
            started = started or message["type"] == "http.response.start"
            await send(message)

        try:
            await self.app(scope, limited_receive, tracking_send)
        except _BodyTooLargeError:
            if started:
                raise
            await _send_json(send, 413, "Request body too large.")


class SecurityHeadersMiddleware:
    """Adds hardening headers (CSP, nosniff, framing, referrer, HSTS in production)."""

    def __init__(self, app: ASGIApp):
        self.app = app

    def _headers_for(self, path: str) -> dict[str, str]:
        headers = dict(STATIC_SECURITY_HEADERS)
        if not path.startswith(DOC_PATHS):
            headers["content-security-policy"] = CSP
        if path.startswith("/api/"):
            headers["cache-control"] = "no-store"
        if settings.is_production:
            headers["strict-transport-security"] = HSTS
        return headers

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        extra = self._headers_for(scope.get("path", ""))

        async def send_with_headers(message: Message) -> None:
            if message["type"] == "http.response.start":
                current = list(message.get("headers", []))
                present = {k.lower() for k, _ in current}
                current += [
                    (k.encode(), v.encode()) for k, v in extra.items() if k.encode() not in present
                ]
                message["headers"] = current
            await send(message)

        await self.app(scope, receive, send_with_headers)
