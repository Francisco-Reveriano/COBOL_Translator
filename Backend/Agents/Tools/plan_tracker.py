"""
Plan Tracker Tool (TodoWrite Equivalent)
==========================================
Manages the state of the conversion plan, mimicking Claude Code's
TodoWrite tool. Provides operations to:
  - View current plan state
  - Update item status (pending → in_progress → completed)
  - Check dependencies before starting items
  - Inject plan reminders into the agent's context

This is the "memory" mechanism that keeps the agent on track during
long-running conversions, similar to how Claude Code injects TODO
state as system messages after each tool use.
"""

import json
from datetime import datetime
from pathlib import Path
from typing import Optional
from strands import tool


# In-memory plan state (persisted to disk on each update)
_plan_state: dict = {}


def _load_plan(output_dir: str) -> dict:
    """Load plan from disk if not in memory."""
    global _plan_state
    if _plan_state and _plan_state.get("plan_id"):
        return _plan_state

    plan_path = Path(output_dir) / "conversion_plan.json"
    if plan_path.exists():
        _plan_state = json.loads(plan_path.read_text())
        return _plan_state

    return {"error": "No plan found. Run conversion_planner first."}


def _save_plan(output_dir: str):
    """Persist current plan state to disk."""
    plan_path = Path(output_dir) / "conversion_plan.json"
    plan_path.write_text(json.dumps(_plan_state, indent=2, default=str))


def _get_status_emoji(status: str) -> str:
    """Status indicator for terminal display."""
    return {
        "pending": "⬜",
        "in_progress": "🔄",
        "completed": "✅",
        "blocked": "🚫",
        "skipped": "⏭️",
    }.get(status, "❓")


def _check_dependencies(item_id: str) -> dict:
    """Check if all dependencies for an item are completed."""
    items_by_id = {item["id"]: item for item in _plan_state.get("items", [])}
    target = items_by_id.get(item_id)
    if not target:
        return {"ready": False, "reason": f"Item {item_id} not found"}

    blocking = []
    for dep_id in target.get("depends_on", []):
        dep_item = items_by_id.get(dep_id)
        if dep_item and dep_item["status"] not in ("completed", "skipped"):
            blocking.append({
                "id": dep_id,
                "title": dep_item["title"],
                "status": dep_item["status"],
            })

    return {
        "ready": len(blocking) == 0,
        "blocking_items": blocking,
    }


# ---------------------------------------------------------------------------
# Strands Tool Definition
# ---------------------------------------------------------------------------
@tool
def plan_tracker(
    action: str,
    output_dir: str = "./output",
    item_id: Optional[str] = None,
    new_status: Optional[str] = None,
    notes: Optional[str] = None,
) -> dict:
    """
    Track and update the COBOL-to-Python conversion plan state.

    This is the TodoWrite equivalent — it manages plan item statuses,
    checks dependencies, and provides plan summaries to keep the agent
    on track during long conversions.

    Args:
        action: One of:
            - "view"           : Show full plan with current statuses
            - "summary"        : Compact progress summary (for context injection)
            - "update_status"  : Change an item's status
            - "check_deps"     : Check if an item's dependencies are met
            - "next"           : Get the next actionable item
            - "progress"       : Show completion percentage and blockers
        output_dir: Directory containing the conversion_plan.json
        item_id: Plan item ID (required for update_status, check_deps)
        new_status: New status value (required for update_status).
                    One of: pending, in_progress, completed, blocked, skipped
        notes: Optional notes to attach to the item update.

    Returns:
        Dict with action results and current plan state summary.
    """
    global _plan_state

    plan = _load_plan(output_dir)
    if "error" in plan:
        return plan

    # ── VIEW: Full plan display ──────────────────────────────────────────
    if action == "view":
        display_items = []
        for item in plan["items"]:
            emoji = _get_status_emoji(item["status"])
            deps_str = f" (deps: {', '.join(item['depends_on'])})" if item["depends_on"] else ""
            display_items.append({
                "id": item["id"],
                "display": f"{emoji} [{item['priority']}] {item['title']} — {item['complexity']}{deps_str}",
                "status": item["status"],
                "phase": item["phase"],
                "program_id": item["program_id"],
                "source_file": item["source_file"],
                "target_file": item["target_file"],
                "conversion_notes": item["conversion_notes"],
            })

        return {
            "plan_id": plan["plan_id"],
            "total_items": len(plan["items"]),
            "items": display_items,
            "guidelines": plan.get("conversion_guidelines", {}),
        }

    # ── SUMMARY: Compact context injection (like Claude Code's reminder) ─
    elif action == "summary":
        items = plan["items"]
        status_counts = {}
        for item in items:
            s = item["status"]
            status_counts[s] = status_counts.get(s, 0) + 1

        in_progress = [
            {"id": item["id"], "title": item["title"]}
            for item in items if item["status"] == "in_progress"
        ]
        next_pending = next(
            (item for item in items if item["status"] == "pending"),
            None,
        )

        return {
            "plan_id": plan["plan_id"],
            "progress": status_counts,
            "completion_pct": round(
                status_counts.get("completed", 0) / len(items) * 100, 1
            ) if items else 0,
            "currently_in_progress": in_progress,
            "next_pending": {
                "id": next_pending["id"],
                "title": next_pending["title"],
            } if next_pending else None,
        }

    # ── UPDATE_STATUS: Change item status ────────────────────────────────
    elif action == "update_status":
        if not item_id or not new_status:
            return {"error": "item_id and new_status required for update_status"}

        valid_statuses = {"pending", "in_progress", "completed", "blocked", "skipped"}
        if new_status not in valid_statuses:
            return {"error": f"Invalid status. Must be one of: {valid_statuses}"}

        for item in _plan_state["items"]:
            if item["id"] == item_id:
                old_status = item["status"]
                item["status"] = new_status

                if new_status == "in_progress":
                    item["started_at"] = datetime.now().isoformat()
                elif new_status == "completed":
                    item["completed_at"] = datetime.now().isoformat()

                if notes:
                    if "update_log" not in item:
                        item["update_log"] = []
                    item["update_log"].append({
                        "timestamp": datetime.now().isoformat(),
                        "from": old_status,
                        "to": new_status,
                        "notes": notes,
                    })

                _save_plan(output_dir)

                return {
                    "updated": True,
                    "item_id": item_id,
                    "old_status": old_status,
                    "new_status": new_status,
                    "title": item["title"],
                }

        return {"error": f"Item {item_id} not found in plan"}

    # ── CHECK_DEPS: Dependency readiness check ───────────────────────────
    elif action == "check_deps":
        if not item_id:
            return {"error": "item_id required for check_deps"}
        return _check_dependencies(item_id)

    # ── NEXT: Get next actionable item ───────────────────────────────────
    elif action == "next":
        for item in _plan_state["items"]:
            if item["status"] == "pending":
                dep_check = _check_dependencies(item["id"])
                if dep_check["ready"]:
                    return {
                        "next_item": {
                            "id": item["id"],
                            "title": item["title"],
                            "phase": item["phase"],
                            "program_id": item["program_id"],
                            "source_file": item["source_file"],
                            "target_file": item["target_file"],
                            "complexity": item["complexity"],
                            "conversion_notes": item["conversion_notes"],
                        },
                        "dependencies_met": True,
                    }

        # Check if all done
        all_done = all(
            item["status"] in ("completed", "skipped")
            for item in _plan_state["items"]
        )
        if all_done:
            return {"next_item": None, "all_completed": True}

        return {"next_item": None, "blocked": True, "reason": "All pending items have unmet dependencies"}

    # ── PROGRESS: Completion stats ───────────────────────────────────────
    elif action == "progress":
        items = _plan_state["items"]
        total = len(items)
        completed = sum(1 for i in items if i["status"] == "completed")
        blocked = [
            {"id": i["id"], "title": i["title"]}
            for i in items if i["status"] == "blocked"
        ]

        return {
            "total": total,
            "completed": completed,
            "in_progress": sum(1 for i in items if i["status"] == "in_progress"),
            "pending": sum(1 for i in items if i["status"] == "pending"),
            "blocked_items": blocked,
            "completion_pct": round(completed / total * 100, 1) if total else 0,
        }

    else:
        return {"error": f"Unknown action: {action}. Use: view, summary, update_status, check_deps, next, progress"}
