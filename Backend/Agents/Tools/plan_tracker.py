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
import logging
from datetime import datetime
from pathlib import Path
from typing import Any, Callable, Optional
from strands import tool
from Backend.Agents.Tools.tool_helpers import strands_result, markdown_result

logger = logging.getLogger(__name__)

# In-memory plan state (persisted to disk on each update)
_plan_state: dict = {}

# Module-level SSE event callback (set by agent factory)
_event_callback: Optional[Callable[[str, dict[str, Any]], None]] = None


def set_event_callback(cb: Optional[Callable[[str, dict[str, Any]], None]]) -> None:
    """Wire the SSE event callback from the agent factory."""
    global _event_callback
    _event_callback = cb


def _emit_plan_update() -> None:
    """Emit a plan_update SSE event with current plan state."""
    if not _event_callback or not _plan_state.get("items"):
        return
    items = _plan_state["items"]
    total = len(items)
    completed = sum(1 for i in items if i["status"] in ("completed", "skipped"))
    progress_pct = round(completed / total * 100, 1) if total else 0
    try:
        _event_callback("plan_update", {
            "plan_id": _plan_state.get("plan_id", ""),
            "items": [
                {
                    "id": i["id"],
                    "title": i["title"],
                    "status": i["status"],
                    "phase": i["phase"],
                    "program_id": i["program_id"],
                    "complexity": i.get("complexity", ""),
                }
                for i in items
            ],
            "progress_pct": progress_pct,
        })
    except Exception as e:
        logger.warning(f"Failed to emit plan_update: {e}")


def _emit_flowchart_update() -> None:
    """Emit a flowchart SSE event with current node statuses from the plan."""
    if not _event_callback or not _plan_state.get("items"):
        return
    dep_graph = _plan_state.get("dependency_graph", {})
    graph_nodes = dep_graph.get("nodes", [])
    graph_edges = dep_graph.get("edges", [])
    if not graph_nodes:
        return

    item_status = {}
    item_score = {}
    for item in _plan_state["items"]:
        pid = item.get("program_id", "")
        if pid and pid not in ("INTEGRATION", "VALIDATION"):
            item_status[pid] = item["status"]

    try:
        _event_callback("flowchart", {
            "nodes": [
                {
                    "id": n["id"],
                    "label": n["id"],
                    "type": "program",
                    "status": item_status.get(n["id"], "pending"),
                    "complexity": n.get("complexity", ""),
                    "loc": n.get("loc", 0),
                    "has_sql": False,
                    "has_cics": False,
                    "source_file": n.get("file", ""),
                }
                for n in graph_nodes
            ],
            "edges": [
                {
                    "id": f"e{i}",
                    "source": e.get("from", ""),
                    "target": e.get("to", ""),
                    "type": e.get("type", "CALL"),
                }
                for i, e in enumerate(graph_edges)
            ],
        })
    except Exception as e:
        logger.warning(f"Failed to emit flowchart: {e}")


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
        return strands_result(plan, status="error")

    # ── VIEW: Full plan display ──────────────────────────────────────────
    if action == "view":
        _emit_plan_update()
        _emit_flowchart_update()

        md_lines = [
            f"## Conversion Plan: `{plan['plan_id']}`",
            f"**Total items:** {len(plan['items'])}",
            "",
            "| Status | ID | Priority | Title | Complexity |",
            "|---|---|---|---|---|",
        ]
        for item in plan["items"]:
            emoji = _get_status_emoji(item["status"])
            md_lines.append(
                f"| {emoji} {item['status']} | {item['id']} | {item['priority']} "
                f"| {item['title']} | {item['complexity']} |"
            )

        return markdown_result("\n".join(md_lines))

    # ── SUMMARY: Compact context injection (like Claude Code's reminder) ─
    elif action == "summary":
        items = plan["items"]
        status_counts: dict[str, int] = {}
        for item in items:
            s = item["status"]
            status_counts[s] = status_counts.get(s, 0) + 1

        total = len(items)
        completed = status_counts.get("completed", 0)
        pct = round(completed / total * 100, 1) if total else 0

        in_progress = [item for item in items if item["status"] == "in_progress"]
        next_pending = next(
            (item for item in items if item["status"] == "pending"),
            None,
        )

        md_lines = [
            f"## Plan Summary ({pct}% complete)",
            "",
        ]
        for s, c in status_counts.items():
            md_lines.append(f"- **{s}:** {c}")
        if in_progress:
            md_lines.append("")
            md_lines.append("**In progress:**")
            for item in in_progress:
                md_lines.append(f"- `{item['id']}` {item['title']}")
        if next_pending:
            md_lines.append("")
            md_lines.append(f"**Next pending:** `{next_pending['id']}` {next_pending['title']}")

        return markdown_result("\n".join(md_lines))

    # ── UPDATE_STATUS: Change item status ────────────────────────────────
    elif action == "update_status":
        if not item_id or not new_status:
            return strands_result({"error": "item_id and new_status required for update_status"}, status="error")

        valid_statuses = {"pending", "in_progress", "completed", "blocked", "skipped"}
        if new_status not in valid_statuses:
            return strands_result({"error": f"Invalid status. Must be one of: {valid_statuses}"}, status="error")

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
                _emit_plan_update()
                _emit_flowchart_update()

                return markdown_result(
                    f"Item `{item_id}` ({item['title']}): {old_status} -> {new_status}"
                )

        return strands_result({"error": f"Item {item_id} not found in plan"}, status="error")

    # ── CHECK_DEPS: Dependency readiness check ───────────────────────────
    elif action == "check_deps":
        if not item_id:
            return strands_result({"error": "item_id required for check_deps"}, status="error")

        dep_result = _check_dependencies(item_id)
        if dep_result["ready"]:
            return markdown_result(f"**Ready:** YES — all dependencies for `{item_id}` are met.")
        else:
            blocking = dep_result["blocking_items"]
            lines = [f"**Ready:** NO — `{item_id}` is blocked by:"]
            for b in blocking:
                lines.append(f"- `{b['id']}` {b['title']} ({b['status']})")
            return markdown_result("\n".join(lines))

    # ── NEXT: Get next actionable item ───────────────────────────────────
    elif action == "next":
        for item in _plan_state["items"]:
            if item["status"] == "pending":
                dep_check = _check_dependencies(item["id"])
                if dep_check["ready"]:
                    md_lines = [
                        "## Next Item",
                        f"- **item_id:** {item['id']}",
                        f"- **title:** {item['title']}",
                        f"- **phase:** {item['phase']}",
                        f"- **program_id:** {item['program_id']}",
                        f"- **source_file:** {item['source_file']}",
                        f"- **target_file:** {item['target_file']}",
                        f"- **complexity:** {item['complexity']}",
                    ]
                    return markdown_result("\n".join(md_lines))

        # Check if all done
        all_done = all(
            item["status"] in ("completed", "skipped")
            for item in _plan_state["items"]
        )
        if all_done:
            return markdown_result("**All items completed.** No more pending work.")

        return markdown_result("**Blocked:** All pending items have unmet dependencies.")

    # ── PROGRESS: Completion stats ───────────────────────────────────────
    elif action == "progress":
        items = _plan_state["items"]
        total = len(items)
        completed = sum(1 for i in items if i["status"] == "completed")
        in_prog = sum(1 for i in items if i["status"] == "in_progress")
        pending = sum(1 for i in items if i["status"] == "pending")
        blocked = [i for i in items if i["status"] == "blocked"]
        pct = round(completed / total * 100, 1) if total else 0

        md_lines = [
            f"## Progress: {pct}%",
            "",
            "| Metric | Count |",
            "|---|---|",
            f"| Completed | {completed} |",
            f"| In progress | {in_prog} |",
            f"| Pending | {pending} |",
            f"| Blocked | {len(blocked)} |",
            f"| **Total** | **{total}** |",
        ]
        if blocked:
            md_lines.append("")
            md_lines.append("**Blocked items:**")
            for i in blocked:
                md_lines.append(f"- `{i['id']}` {i['title']}")

        return markdown_result("\n".join(md_lines))

    else:
        return strands_result({"error": f"Unknown action: {action}. Use: view, summary, update_status, check_deps, next, progress"}, status="error")
