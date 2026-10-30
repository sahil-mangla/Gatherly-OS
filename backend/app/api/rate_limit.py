"""Small in-memory fixed-window rate limiter exposed as FastAPI dependencies.

State is per-process, so limits are approximate across workers or serverless instances; it
is a cheap abuse brake, not a distributed quota.
"""

import threading
import time
from collections import OrderedDict
from collections.abc import Callable
from typing import Annotated

from fastapi import Depends, HTTPException, Request, status

from ..auth.dependencies import AuthContext, get_current_user
from ..config import settings

WINDOW_SECONDS = 60
_MAX_KEYS = 10_000


class FixedWindowLimiter:
    """Counts hits per key inside fixed windows and reports how long to wait when exceeded."""

    def __init__(self, window: int = WINDOW_SECONDS, max_keys: int = _MAX_KEYS):
        self.window = window
        self.max_keys = max_keys
        # Insertion order == recency of the last hit, so the oldest key is always at the front.
        self._hits: OrderedDict[str, tuple[int, int]] = OrderedDict()
        self._lock = threading.Lock()

    def hit(self, key: str, limit: int, now: float | None = None) -> int:
        """Record a hit; return 0 if allowed, otherwise seconds until the window resets."""
        current = time.time() if now is None else now
        window_id = int(current // self.window)
        with self._lock:
            start, count = self._hits.get(key, (window_id, 0))
            count = count + 1 if start == window_id else 1
            self._hits[key] = (window_id, count)
            self._hits.move_to_end(key)
            if len(self._hits) > self.max_keys:
                self._hits.popitem(last=False)  # O(1) eviction of the least recently hit key
        if count <= limit:
            return 0
        return max(1, int((window_id + 1) * self.window - current))

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()


limiter = FixedWindowLimiter()


def client_ip(request: Request) -> str:
    """Best-effort client address; X-Forwarded-For is honoured only behind a trusted proxy."""
    forwarded = request.headers.get("x-forwarded-for", "")
    if settings.trust_proxy and forwarded:
        return forwarded.split(",")[0].strip()[:64]
    return request.client.host if request.client else "unknown"


def _enforce(key: str, limit: int) -> None:
    if not settings.rate_limit_enabled:
        return
    retry_after = limiter.hit(key, limit)
    if retry_after:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many requests. Please slow down.",
            headers={"Retry-After": str(retry_after)},
        )


def limit_by_ip(scope: str, limit: int):
    """Dependency limiting unauthenticated endpoints (login, register) per client IP."""

    def dependency(request: Request) -> None:
        _enforce(f"{scope}:{client_ip(request)}", limit)

    return dependency


def limit_by_user(scope: str, limit: int):
    """Dependency requiring auth and limiting per (client IP, user); returns the auth context."""

    def dependency(
        request: Request, auth: Annotated[AuthContext, Depends(get_current_user)]
    ) -> AuthContext:
        _enforce(f"{scope}:{client_ip(request)}:{auth.user_id}", limit)
        return auth

    return dependency


def limit_globally(scope: str, limit: Callable[[], int]):
    """Dependency enforcing one budget shared by every caller (a cap on upstream spend).

    ``limit`` is a callable so the setting is read per request. Hits are only counted once the
    request is authenticated when this is declared after an auth dependency.
    """

    def dependency() -> None:
        _enforce(f"{scope}:global", limit())

    return dependency
