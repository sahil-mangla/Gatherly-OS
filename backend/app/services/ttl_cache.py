"""Tiny thread-safe TTL + LRU cache for idempotent model responses."""

import hashlib
import json
import threading
import time
from collections import OrderedDict
from typing import Any


def cache_key(*parts: Any) -> str:
    """Stable sha256 digest of JSON-serialisable parts."""
    raw = json.dumps(parts, sort_keys=True, default=str, separators=(",", ":"))
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


class TTLCache:
    """Bounded cache whose entries expire ``ttl`` seconds after being stored."""

    def __init__(self, ttl: float = 60.0, max_entries: int = 128) -> None:
        self.ttl = ttl
        self.max_entries = max_entries
        self._data: OrderedDict[str, tuple[float, Any]] = OrderedDict()
        self._lock = threading.Lock()

    def get(self, key: str) -> Any | None:
        """The live value for ``key``, or ``None`` when absent or expired."""
        with self._lock:
            entry = self._data.get(key)
            if entry is None:
                return None
            if entry[0] < time.monotonic():
                del self._data[key]
                return None
            self._data.move_to_end(key)
            return entry[1]

    def set(self, key: str, value: Any) -> None:
        """Store ``value`` under ``key`` and evict the oldest entries beyond ``max_entries``."""
        with self._lock:
            self._data[key] = (time.monotonic() + self.ttl, value)
            self._data.move_to_end(key)
            while len(self._data) > self.max_entries:
                self._data.popitem(last=False)

    def clear(self) -> None:
        """Drop every entry."""
        with self._lock:
            self._data.clear()
