"""
Audit Logger
=============
Append-only JSONL audit trail for conversion sessions (FR-8.7, FR-8.8).

Writes one JSON entry per line to: ./output/logs/session_{timestamp}.jsonl
Each entry includes: timestamp, event_type, and relevant payload data.

The audit logger hooks into the event bus to automatically capture
all tool calls, results, scores, errors, and reasoning events.
"""

from __future__ import annotations

import json
import logging
import threading
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

logger = logging.getLogger(__name__)


class AuditLogger:
    """Thread-safe append-only JSONL audit logger."""

    def __init__(self) -> None:
        self._file_path: Optional[Path] = None
        self._file_handle: Any = None
        self._lock = threading.Lock()
        self._entry_count = 0

    def start_session(self, output_dir: str, session_id: str) -> str:
        """Create a new audit log file for this session."""
        self.close()

        log_dir = Path(output_dir) / "logs"
        log_dir.mkdir(parents=True, exist_ok=True)

        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        self._file_path = log_dir / f"session_{session_id}_{timestamp}.jsonl"
        self._file_handle = open(self._file_path, "a", encoding="utf-8")
        self._entry_count = 0

        # Write session start entry
        self._write_entry({
            "event_type": "session_start",
            "session_id": session_id,
            "output_dir": output_dir,
        })

        logger.info(f"Audit log started: {self._file_path}")
        return str(self._file_path)

    def log_event(self, event_type: str, payload: dict[str, Any]) -> None:
        """Append a single audit entry."""
        if not self._file_handle:
            return

        # Extract relevant fields, truncate large content
        entry: dict[str, Any] = {
            "event_type": event_type,
        }

        if event_type == "tool_call":
            entry["tool"] = payload.get("tool", "")
            # Truncate large inputs (e.g., full COBOL source)
            raw_input = payload.get("input", {})
            entry["input_summary"] = _truncate_dict(raw_input, max_str_len=500)

        elif event_type == "tool_result":
            entry["tool"] = payload.get("tool", "")
            entry["duration_ms"] = payload.get("duration_ms", 0)
            raw_output = payload.get("output", {})
            entry["output_summary"] = _truncate_dict(raw_output, max_str_len=500)

        elif event_type == "score":
            entry["module"] = payload.get("module", "")
            entry["scores"] = payload.get("scores", {})
            entry["overall"] = payload.get("overall", 0)
            entry["threshold"] = payload.get("threshold", "")
            entry["issue_count"] = len(payload.get("issues", []))
            entry["fallback"] = payload.get("fallback", False)

        elif event_type == "error":
            entry["message"] = payload.get("message", "")
            entry["tool"] = payload.get("tool", "")
            entry["recoverable"] = payload.get("recoverable", True)
            entry["retry_count"] = payload.get("retry_count", 0)

        elif event_type == "reasoning":
            # Only log a summary — reasoning text can be huge
            text = payload.get("text", "")
            entry["phase"] = payload.get("phase", "")
            entry["text_excerpt"] = text[:200] if text else ""

        elif event_type == "plan_update":
            entry["plan_id"] = payload.get("plan_id", "")
            entry["progress_pct"] = payload.get("progress_pct", 0)
            items = payload.get("items", [])
            entry["item_count"] = len(items)
            entry["status_summary"] = _count_statuses(items)

        elif event_type in ("complete", "session_start", "session_end"):
            entry.update({k: v for k, v in payload.items() if not isinstance(v, (bytes, bytearray))})

        else:
            # Generic — include truncated payload
            entry["payload"] = _truncate_dict(payload, max_str_len=300)

        self._write_entry(entry)

    def end_session(self, summary: dict[str, Any] | None = None) -> None:
        """Write session end entry and close the file."""
        if self._file_handle:
            self._write_entry({
                "event_type": "session_end",
                "total_entries": self._entry_count,
                "summary": summary or {},
            })
        self.close()

    def close(self) -> None:
        """Close the audit log file."""
        with self._lock:
            if self._file_handle:
                try:
                    self._file_handle.close()
                except Exception:
                    pass
                self._file_handle = None

    def _write_entry(self, entry: dict[str, Any]) -> None:
        """Write a single JSON line to the audit log."""
        with self._lock:
            if not self._file_handle:
                return
            entry["timestamp"] = datetime.now().isoformat()
            entry["seq"] = self._entry_count
            try:
                self._file_handle.write(json.dumps(entry, default=str) + "\n")
                self._file_handle.flush()
                self._entry_count += 1
            except Exception as e:
                logger.warning(f"Audit log write failed: {e}")

    @property
    def file_path(self) -> Optional[str]:
        return str(self._file_path) if self._file_path else None

    @property
    def entry_count(self) -> int:
        return self._entry_count


def _truncate_dict(d: Any, max_str_len: int = 500) -> Any:
    """Truncate string values in a dict for audit logging.

    Defensive: accepts str or non-dict inputs without crashing.
    The Strands SDK may stringify tool results, so *d* is not always a dict.
    """
    if isinstance(d, str):
        return d[:max_str_len] + f"... ({len(d)} chars total)" if len(d) > max_str_len else d
    if not isinstance(d, dict):
        return str(d)[:max_str_len]
    result = {}
    for k, v in d.items():
        if isinstance(v, str) and len(v) > max_str_len:
            result[k] = v[:max_str_len] + f"... ({len(v)} chars total)"
        elif isinstance(v, dict):
            result[k] = _truncate_dict(v, max_str_len)
        elif isinstance(v, list) and len(v) > 10:
            result[k] = f"[{len(v)} items]"
        else:
            result[k] = v
    return result


def _count_statuses(items: list) -> dict[str, int]:
    """Count plan item statuses."""
    counts: dict[str, int] = {}
    for item in items:
        s = item.get("status", "unknown") if isinstance(item, dict) else "unknown"
        counts[s] = counts.get(s, 0) + 1
    return counts


# Module-level singleton
audit_log = AuditLogger()
