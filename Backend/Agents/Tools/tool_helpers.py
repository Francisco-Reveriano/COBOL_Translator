"""
Tool Helpers
=============
Utilities shared across all Strands tools.

The Strands SDK ``@tool`` decorator inspects return values for ``status``
and ``content`` keys.  If they are missing the SDK stringifies the result
via ``str()``, which downstream code cannot iterate with ``.items()``.

``strands_result`` wraps any dict payload in the format the SDK expects,
using ``json.dumps`` (proper JSON) instead of ``str()`` (Python repr).

``ConversionContext`` provides a thread-safe, write-through in-memory cache
so tools communicate via memory instead of re-reading JSON files from disk.
"""

import json
import logging
import threading
from pathlib import Path
from typing import Any, Optional

logger = logging.getLogger(__name__)


def strands_result(data: Any, status: str = "success") -> dict:
    """Wrap *data* in the Strands SDK tool-return envelope.

    Returns ``{"status": status, "content": [{"text": json_string}]}``.
    """
    return {
        "status": status,
        "content": [{"text": json.dumps(data, default=str)}],
    }


def markdown_result(text: str, status: str = "success") -> dict:
    """Wrap a markdown string in the Strands SDK tool-return envelope."""
    return {
        "status": status,
        "content": [{"text": text}],
    }


# ---------------------------------------------------------------------------
# In-Memory Shared Context (write-through cache)
# ---------------------------------------------------------------------------
class ConversionContext:
    """Thread-safe in-memory cache for inter-tool data.

    Avoids repeated disk reads for ``scan_results.json``,
    ``conversion_plan.json``, ``scores/*.json``, etc.

    Pattern: write-through cache — reads from memory first,
    falls back to disk; writes update both memory and disk.

    Usage::

        ctx = ConversionContext.instance()
        data = ctx.get("scan_results", fallback_path="output/scan_results.json")
        ctx.set("scan_results", data, persist_path="output/scan_results.json")
    """

    _instance: Optional["ConversionContext"] = None
    _instance_lock = threading.Lock()

    def __init__(self) -> None:
        self._store: dict[str, Any] = {}
        self._lock = threading.Lock()

    @classmethod
    def instance(cls) -> "ConversionContext":
        """Return the singleton instance (lazy init)."""
        if cls._instance is None:
            with cls._instance_lock:
                if cls._instance is None:
                    cls._instance = cls()
        return cls._instance

    @classmethod
    def reset(cls) -> None:
        """Clear the singleton for fresh conversions."""
        with cls._instance_lock:
            if cls._instance is not None:
                with cls._instance._lock:
                    cls._instance._store.clear()
                cls._instance = None

    def get(self, key: str, fallback_path: Optional[str] = None) -> Optional[Any]:
        """Read from memory, falling back to disk if not cached.

        Args:
            key: Cache key (e.g. ``"scan_results"``).
            fallback_path: Path to JSON file to read on cache miss.

        Returns:
            Cached dict/list, or ``None`` if not found anywhere.
        """
        with self._lock:
            if key in self._store:
                return self._store[key]

        # Cache miss — try disk
        if fallback_path:
            fp = Path(fallback_path)
            if fp.exists():
                try:
                    data = json.loads(fp.read_text())
                    with self._lock:
                        self._store[key] = data
                    return data
                except (json.JSONDecodeError, OSError) as e:
                    logger.warning(f"ConversionContext disk fallback failed for {key}: {e}")

        return None

    def set(self, key: str, value: Any, persist_path: Optional[str] = None) -> None:
        """Write to memory and optionally persist to disk.

        Args:
            key: Cache key.
            value: Data to cache.
            persist_path: If provided, also write JSON to this path.
        """
        with self._lock:
            self._store[key] = value

        if persist_path:
            fp = Path(persist_path)
            try:
                fp.parent.mkdir(parents=True, exist_ok=True)
                fp.write_text(json.dumps(value, indent=2, default=str))
            except OSError as e:
                logger.warning(f"ConversionContext disk persist failed for {key}: {e}")

    def has(self, key: str) -> bool:
        """Check if a key is in the memory cache."""
        with self._lock:
            return key in self._store
