"""
Session Manager
================
Single-session in-memory state for the local-first application (PRD 2.3).
Tracks conversion progress, active phase, steering flags, and
persists recovery checkpoints (FR-8.3).
"""

from __future__ import annotations

import asyncio
import json
import logging
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

from Backend.schemas import SessionStatus

logger = logging.getLogger(__name__)

CHECKPOINT_DIR = Path(".cobol2py")
CHECKPOINT_FILE = CHECKPOINT_DIR / "state.json"


@dataclass
class Session:
    session_id: str = ""
    status: SessionStatus = SessionStatus.IDLE
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    current_phase: str = ""
    current_item_id: str = ""
    progress_pct: float = 0.0

    # Steering flags (FR-7)
    pause_requested: bool = False
    skip_requested: bool = False
    retry_item_id: Optional[str] = None

    # Scores collected during conversion
    scores: list[dict] = field(default_factory=list)

    # Error recovery tracking (D-16)
    retry_counts: dict[str, int] = field(default_factory=dict)

    # The asyncio Task running the agent
    agent_task: Optional[asyncio.Task] = None

    # Pause synchronization
    _pause_event: asyncio.Event = field(default_factory=asyncio.Event)

    def __post_init__(self) -> None:
        self._pause_event.set()  # Not paused by default

    def start(self) -> str:
        """Initialize a new conversion session."""
        self.session_id = uuid.uuid4().hex[:12]
        self.status = SessionStatus.RUNNING
        self.start_time = datetime.now()
        self.end_time = None
        self.current_phase = "scan"
        self.current_item_id = ""
        self.progress_pct = 0.0
        self.pause_requested = False
        self.skip_requested = False
        self.retry_item_id = None
        self.scores = []
        self.retry_counts = {}
        self._pause_event.set()
        self.save_checkpoint()
        return self.session_id

    def pause(self) -> None:
        """Request pause — agent will stop after current tool call."""
        self.pause_requested = True
        self.status = SessionStatus.PAUSED
        self._pause_event.clear()
        self.save_checkpoint()

    def resume(self) -> None:
        """Resume from pause."""
        self.pause_requested = False
        self.status = SessionStatus.RUNNING
        self._pause_event.set()
        self.save_checkpoint()

    def skip(self) -> None:
        """Request skip of current module."""
        self.skip_requested = True

    def retry(self, item_id: str) -> None:
        """Request retry of a specific module."""
        self.retry_item_id = item_id

    def complete(self) -> None:
        """Mark session as completed."""
        self.status = SessionStatus.COMPLETED
        self.end_time = datetime.now()
        self.save_checkpoint()

    def fail(self) -> None:
        """Mark session as failed."""
        self.status = SessionStatus.FAILED
        self.end_time = datetime.now()
        self.save_checkpoint()

    def update_progress(self, phase: str, item_id: str, progress_pct: float) -> None:
        """Update current progress and write checkpoint (FR-8.3)."""
        self.current_phase = phase
        self.current_item_id = item_id
        self.progress_pct = progress_pct
        self.save_checkpoint()

    def record_retry(self, item_id: str) -> int:
        """Increment and return retry count for an item (D-16)."""
        self.retry_counts[item_id] = self.retry_counts.get(item_id, 0) + 1
        return self.retry_counts[item_id]

    def get_retry_count(self, item_id: str) -> int:
        """Get current retry count for an item."""
        return self.retry_counts.get(item_id, 0)

    async def wait_if_paused(self) -> None:
        """Block until resumed. Called between tool invocations."""
        await self._pause_event.wait()

    def elapsed_seconds(self) -> Optional[float]:
        if self.start_time:
            end = self.end_time or datetime.now()
            return (end - self.start_time).total_seconds()
        return None

    # ── Checkpoint persistence (FR-8.3) ──────────────────────────────

    def save_checkpoint(self) -> None:
        """Write current state to .cobol2py/state.json."""
        try:
            CHECKPOINT_DIR.mkdir(exist_ok=True)
            state = {
                "session_id": self.session_id,
                "status": self.status.value,
                "current_phase": self.current_phase,
                "current_item_id": self.current_item_id,
                "progress_pct": self.progress_pct,
                "start_time": self.start_time.isoformat() if self.start_time else None,
                "scores_count": len(self.scores),
                "retry_counts": self.retry_counts,
                "timestamp": datetime.now().isoformat(),
            }
            CHECKPOINT_FILE.write_text(json.dumps(state, indent=2))
        except Exception as e:
            logger.warning(f"Failed to save checkpoint: {e}")

    @staticmethod
    def load_checkpoint() -> Optional[dict[str, Any]]:
        """Load checkpoint from disk if it exists (FR-8.4)."""
        if not CHECKPOINT_FILE.exists():
            return None
        try:
            data = json.loads(CHECKPOINT_FILE.read_text())
            return data
        except Exception as e:
            logger.warning(f"Failed to load checkpoint: {e}")
            return None

    @staticmethod
    def has_incomplete_conversion(output_dir: str = "./output") -> dict[str, Any]:
        """
        Check if a previous conversion was interrupted (FR-8.5).

        Returns dict with:
          - resumable: bool
          - checkpoint: dict or None
          - plan_summary: dict or None (completed/pending/total counts)
        """
        checkpoint = Session.load_checkpoint()
        plan_path = Path(output_dir) / "conversion_plan.json"

        if not checkpoint or not plan_path.exists():
            return {"resumable": False}

        # Check if the session was not completed
        if checkpoint.get("status") in ("completed", "idle"):
            return {"resumable": False}

        # Analyze plan state
        try:
            plan = json.loads(plan_path.read_text())
            items = plan.get("items", [])
            completed = sum(1 for i in items if i["status"] in ("completed", "skipped"))
            pending = sum(1 for i in items if i["status"] == "pending")
            in_progress = sum(1 for i in items if i["status"] == "in_progress")
            total = len(items)

            if pending == 0 and in_progress == 0:
                return {"resumable": False}

            return {
                "resumable": True,
                "checkpoint": checkpoint,
                "plan_summary": {
                    "total": total,
                    "completed": completed,
                    "pending": pending,
                    "in_progress": in_progress,
                    "progress_pct": round(completed / total * 100, 1) if total else 0,
                    "plan_id": plan.get("plan_id", ""),
                },
            }
        except Exception as e:
            logger.warning(f"Failed to analyze plan: {e}")
            return {"resumable": False}

    @staticmethod
    def clear_checkpoint() -> None:
        """Remove checkpoint file."""
        try:
            if CHECKPOINT_FILE.exists():
                CHECKPOINT_FILE.unlink()
        except Exception:
            pass


# Module-level singleton
session = Session()
