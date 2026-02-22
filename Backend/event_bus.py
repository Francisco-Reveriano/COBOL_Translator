"""
SSE Event Bus
==============
In-memory event buffer with sequential IDs for Server-Sent Events.
Supports Last-Event-ID reconnection replay (FR-2.5).

Thread-safe: the agent runs in an asyncio task and emits events
that are consumed by the SSE streaming endpoint.
"""

from __future__ import annotations

import asyncio
import json
import threading
from datetime import datetime
from typing import Any, AsyncGenerator, Optional


class EventBus:
    """In-memory SSE event buffer with replay support."""

    def __init__(self) -> None:
        self._events: list[dict[str, Any]] = []
        self._lock = threading.Lock()
        self._notify: asyncio.Event | None = None
        self._loop: asyncio.AbstractEventLoop | None = None

    def bind_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        """Bind to the running asyncio event loop for cross-thread signaling."""
        self._loop = loop
        self._notify = asyncio.Event()

    def emit(self, event_type: str, payload: dict[str, Any]) -> int:
        """
        Append an event to the buffer and notify waiting consumers.

        Returns the sequential event ID.
        """
        with self._lock:
            event_id = len(self._events) + 1
            event = {
                "id": event_id,
                "event": event_type,
                "timestamp": datetime.now().isoformat(),
                "data": payload,
            }
            self._events.append(event)

        # Signal async consumers from any thread
        if self._notify and self._loop:
            self._loop.call_soon_threadsafe(self._notify.set)

        return event_id

    def get_events(self, after_id: int = 0) -> list[dict[str, Any]]:
        """Get all events after the given ID (for replay)."""
        with self._lock:
            return [e for e in self._events if e["id"] > after_id]

    async def stream(
        self, last_event_id: int = 0, timeout: float = 30.0
    ) -> AsyncGenerator[str, None]:
        """
        Async generator yielding SSE-formatted strings.

        Replays any missed events since last_event_id, then waits
        for new events with a heartbeat keepalive.
        """
        cursor = last_event_id

        while True:
            # Yield any buffered events we haven't sent yet
            events = self.get_events(after_id=cursor)
            for event in events:
                cursor = event["id"]
                yield self._format_sse(event)

            # Wait for new events or send keepalive
            if self._notify:
                self._notify.clear()
                try:
                    await asyncio.wait_for(self._notify.wait(), timeout=timeout)
                except asyncio.TimeoutError:
                    # Send keepalive comment to prevent connection timeout
                    yield ": keepalive\n\n"

    def clear(self) -> None:
        """Clear all events (new session)."""
        with self._lock:
            self._events.clear()

    @property
    def event_count(self) -> int:
        with self._lock:
            return len(self._events)

    @staticmethod
    def _format_sse(event: dict[str, Any]) -> str:
        """Format an event as an SSE string."""
        lines = [
            f"event: {event['event']}",
            f"id: {event['id']}",
            f"data: {json.dumps(event['data'], default=str)}",
            "",
            "",  # SSE requires double newline
        ]
        return "\n".join(lines)


# Module-level singleton
event_bus = EventBus()
