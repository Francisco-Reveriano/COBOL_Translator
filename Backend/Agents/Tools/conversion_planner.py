"""
Conversion Planner Tool (TodoWrite Pattern)
============================================
Generates a structured, trackable conversion plan inspired by
Claude Code's TodoWrite tool. Each plan item has:
  - Unique ID
  - Status (pending → in_progress → completed → blocked)
  - Priority (P0-P3)
  - Dependencies on other plan items
  - Detailed conversion instructions

The plan follows a topological ordering based on the dependency graph,
ensuring COPY books and shared modules are converted first.
"""

import json
import hashlib
from datetime import datetime
from pathlib import Path
from typing import Any
from strands import tool


# ---------------------------------------------------------------------------
# Plan Item Schema
# ---------------------------------------------------------------------------
PLAN_ITEM_TEMPLATE = {
    "id": "",
    "status": "pending",          # pending | in_progress | completed | blocked | skipped
    "priority": "P2",             # P0 (critical) → P3 (low)
    "phase": "",                  # scan | shared_modules | core_programs | integration | validation
    "title": "",
    "program_id": "",
    "source_file": "",
    "target_file": "",
    "complexity": "",
    "estimated_loc": 0,
    "depends_on": [],             # list of plan item IDs
    "conversion_notes": {},       # detailed conversion instructions
    "started_at": None,
    "completed_at": None,
}


def _generate_id(program_id: str, phase: str) -> str:
    """Generate a short deterministic ID for a plan item."""
    raw = f"{phase}:{program_id}"
    return hashlib.md5(raw.encode()).hexdigest()[:8]


def _determine_conversion_order(programs: list[dict], dep_graph: dict) -> list[str]:
    """
    Topological sort of programs based on dependency graph.
    Programs with no dependencies (leaf nodes) come first,
    ensuring COPY books are converted before programs that include them.
    """
    # Build adjacency from dep_graph edges
    in_degree = {p["program_id"]: 0 for p in programs}
    adjacency = {p["program_id"]: [] for p in programs}

    for edge in dep_graph.get("edges", []):
        from_node = edge["from"]
        to_node = edge["to"]
        if to_node in adjacency:
            adjacency[to_node].append(from_node)
            if from_node in in_degree:
                in_degree[from_node] = in_degree.get(from_node, 0) + 1

    # Kahn's algorithm
    queue = [n for n, d in in_degree.items() if d == 0]
    ordered = []

    while queue:
        node = queue.pop(0)
        ordered.append(node)
        for neighbor in adjacency.get(node, []):
            in_degree[neighbor] -= 1
            if in_degree[neighbor] == 0:
                queue.append(neighbor)

    # Add any remaining (cycles or disconnected)
    remaining = [p["program_id"] for p in programs if p["program_id"] not in ordered]
    ordered.extend(remaining)

    return ordered


def _build_conversion_notes(program: dict) -> dict:
    """Generate detailed conversion instructions for a single program."""
    notes = {
        "data_mapping_strategy": "",
        "control_flow_strategy": "",
        "io_strategy": "",
        "sql_strategy": None,
        "cics_strategy": None,
        "testing_notes": "",
        "risk_factors": [],
    }

    # Data mapping
    if program["data_items_count"] > 0:
        notes["data_mapping_strategy"] = (
            f"Map {program['data_items_count']} COBOL data items to Python dataclasses or TypedDicts. "
            f"PIC X → str, PIC 9 → int/Decimal, PIC S9 COMP → int. "
            f"Group levels (01-49) become nested dataclasses. "
            f"REDEFINES → Union types or property accessors."
        )

    # Control flow
    perform_count = len(program.get("performs", []))
    notes["control_flow_strategy"] = (
        f"Convert {perform_count} PERFORM statements to function calls. "
        f"PERFORM ... THRU → sequential function calls. "
        f"PERFORM ... UNTIL → while loops. "
        f"PERFORM ... VARYING → for loops with range(). "
        f"GO TO statements → refactor to structured control flow (if/else/while). "
        f"EVALUATE/WHEN → match/case (Python 3.10+) or if/elif chains."
    )

    # I/O strategy
    if program.get("file_definitions"):
        file_names = [f["name"] for f in program["file_definitions"]]
        notes["io_strategy"] = (
            f"Convert {len(file_names)} file definitions ({', '.join(file_names)}) "
            f"to Python file handlers. Sequential files → open()/csv. "
            f"Indexed files → SQLite or dict-based lookup. "
            f"VSAM → consider DynamoDB or S3 depending on access pattern."
        )
    else:
        notes["io_strategy"] = "No file I/O detected. Focus on in-memory data processing."

    # Embedded SQL
    if program["has_embedded_sql"]:
        notes["sql_strategy"] = (
            "Convert EXEC SQL blocks to SQLAlchemy or psycopg2/boto3 calls. "
            "Map host variables to Python parameters. "
            "SQLCODE checks → try/except with specific exception handling. "
            "CURSOR operations → context managers with fetchall/fetchone."
        )

    # CICS
    if program["has_cics"]:
        notes["cics_strategy"] = (
            "CICS transactions require architectural redesign: "
            "SEND MAP → REST API response / HTML template. "
            "RECEIVE MAP → API request body parsing. "
            "LINK/XCTL → function calls or microservice invocations. "
            "COMMAREA → function parameters or shared state object. "
            "BMS maps → Pydantic models for request/response validation."
        )
        notes["risk_factors"].append("CICS dependency requires significant architectural changes")

    # Risk factors
    if program["complexity"] in ("high", "critical"):
        notes["risk_factors"].append(f"High complexity ({program['lines_of_code']} LOC)")
    if len(program.get("call_dependencies", [])) > 3:
        notes["risk_factors"].append(
            f"Heavy inter-program coupling ({len(program['call_dependencies'])} CALL deps)"
        )

    notes["testing_notes"] = (
        f"Create unit tests for each converted paragraph/section. "
        f"Use sample COBOL test data to verify numeric precision (especially COMP-3/packed decimal). "
        f"Validate file I/O with fixture files matching original record layouts."
    )

    return notes


# ---------------------------------------------------------------------------
# Strands Tool Definition
# ---------------------------------------------------------------------------
@tool
def conversion_planner(scan_results: dict, output_dir: str = "./output") -> dict:
    """
    Generate a structured COBOL-to-Python conversion plan (TodoWrite pattern).

    Takes the output of cobol_scanner and produces an ordered, dependency-aware
    plan with detailed conversion instructions for each program. The plan follows
    Claude Code's TodoWrite pattern with trackable statuses and priorities.

    Args:
        scan_results: Output from the cobol_scanner tool containing 'programs'
                      and 'dependency_graph'.
        output_dir: Target directory for converted Python files.

    Returns:
        Dict with 'plan_id', 'items' (ordered list of plan items),
        'phases' summary, and 'conversion_guidelines'.
    """
    programs = scan_results.get("programs", [])
    dep_graph = scan_results.get("dependency_graph", {"nodes": [], "edges": []})

    if not programs:
        return {"error": "No programs found in scan results"}

    # Determine conversion order via topological sort
    conversion_order = _determine_conversion_order(programs, dep_graph)
    program_lookup = {p["program_id"]: p for p in programs}

    # Build plan items in phases
    plan_items = []
    plan_id = f"cobol2py_{datetime.now().strftime('%Y%m%d_%H%M%S')}"

    # ── Phase 0: Shared Modules (COPY books / utility programs) ───────────
    copy_programs = [
        pid for pid in conversion_order
        if pid in program_lookup and program_lookup[pid]["file"].endswith((".cpy", ".CPY"))
    ]

    for idx, pid in enumerate(copy_programs):
        prog = program_lookup[pid]
        item_id = _generate_id(pid, "shared")
        plan_items.append({
            **PLAN_ITEM_TEMPLATE,
            "id": item_id,
            "priority": "P0",
            "phase": "shared_modules",
            "title": f"Convert shared copybook: {pid}",
            "program_id": pid,
            "source_file": prog["file"],
            "target_file": f"{output_dir}/shared/{pid.lower().replace('-', '_')}.py",
            "complexity": prog["complexity"],
            "estimated_loc": prog["lines_of_code"],
            "depends_on": [],
            "conversion_notes": _build_conversion_notes(prog),
        })

    # ── Phase 1: Core Programs (dependency order) ────────────────────────
    core_programs = [pid for pid in conversion_order if pid not in copy_programs and pid in program_lookup]

    copy_item_ids = {item["program_id"]: item["id"] for item in plan_items}

    for idx, pid in enumerate(core_programs):
        prog = program_lookup[pid]
        item_id = _generate_id(pid, "core")

        # Resolve dependencies to plan item IDs
        deps = []
        for dep_pid in prog.get("copy_dependencies", []):
            if dep_pid in copy_item_ids:
                deps.append(copy_item_ids[dep_pid])
        for dep_pid in prog.get("call_dependencies", []):
            # Check if called program has already been planned
            dep_item_id = _generate_id(dep_pid, "core")
            existing_ids = {item["id"] for item in plan_items}
            if dep_item_id in existing_ids:
                deps.append(dep_item_id)

        # Priority based on complexity and dependency count
        if prog["has_cics"] or prog["complexity"] == "critical":
            priority = "P0"
        elif prog["has_embedded_sql"] or prog["complexity"] == "high":
            priority = "P1"
        elif prog["complexity"] == "medium":
            priority = "P2"
        else:
            priority = "P3"

        plan_items.append({
            **PLAN_ITEM_TEMPLATE,
            "id": item_id,
            "priority": priority,
            "phase": "core_programs",
            "title": f"Convert program: {pid}",
            "program_id": pid,
            "source_file": prog["file"],
            "target_file": f"{output_dir}/programs/{pid.lower().replace('-', '_')}.py",
            "complexity": prog["complexity"],
            "estimated_loc": prog["lines_of_code"],
            "depends_on": deps,
            "conversion_notes": _build_conversion_notes(prog),
        })

    # ── Phase 2: Integration tasks ───────────────────────────────────────
    integration_id = _generate_id("integration", "integration")
    all_core_ids = [item["id"] for item in plan_items if item["phase"] == "core_programs"]
    plan_items.append({
        **PLAN_ITEM_TEMPLATE,
        "id": integration_id,
        "priority": "P1",
        "phase": "integration",
        "title": "Integration: wire up inter-program calls and shared modules",
        "program_id": "INTEGRATION",
        "source_file": "",
        "target_file": f"{output_dir}/main.py",
        "complexity": "medium",
        "estimated_loc": 0,
        "depends_on": all_core_ids,
        "conversion_notes": {
            "description": (
                "Create main.py entry point. Wire up CALL dependencies as function imports. "
                "Ensure COPY book conversions are properly imported as shared modules. "
                "Implement COMMAREA-equivalent data passing between modules."
            ),
        },
    })

    # ── Phase 3: Validation ──────────────────────────────────────────────
    validation_id = _generate_id("validation", "validation")
    plan_items.append({
        **PLAN_ITEM_TEMPLATE,
        "id": validation_id,
        "priority": "P1",
        "phase": "validation",
        "title": "Validate all converted programs against COBOL specifications",
        "program_id": "VALIDATION",
        "source_file": "",
        "target_file": f"{output_dir}/tests/",
        "complexity": "medium",
        "estimated_loc": 0,
        "depends_on": [integration_id],
        "conversion_notes": {
            "description": (
                "Run validation_checker on all converted files. "
                "Verify data type mappings, control flow equivalence, "
                "and I/O compatibility. Generate test stubs."
            ),
        },
    })

    # ── Phase summary ────────────────────────────────────────────────────
    phase_summary = {}
    for item in plan_items:
        phase = item["phase"]
        if phase not in phase_summary:
            phase_summary[phase] = {"count": 0, "total_loc": 0, "items": []}
        phase_summary[phase]["count"] += 1
        phase_summary[phase]["total_loc"] += item["estimated_loc"]
        phase_summary[phase]["items"].append(item["id"])

    # ── Global conversion guidelines ─────────────────────────────────────
    guidelines = {
        "python_version": "3.11+",
        "type_hints": "Required for all functions and data classes",
        "decimal_handling": "Use decimal.Decimal for all COMP-3 / packed decimal fields",
        "string_handling": "COBOL PIC X fields → str with .strip(); preserve original lengths as constants",
        "error_handling": "Map COBOL status codes to Python exceptions with custom exception hierarchy",
        "file_io": "Use pathlib.Path; csv module for sequential files; sqlite3 for indexed files",
        "sql_mapping": "EXEC SQL → SQLAlchemy Core or raw psycopg2 with parameterized queries",
        "naming_convention": "COBOL-STYLE-NAME → python_style_name (snake_case)",
        "documentation": "Docstrings with original COBOL paragraph/section name reference",
        "testing": "pytest with fixtures matching COBOL test data",
    }

    # Save plan to disk
    plan = {
        "plan_id": plan_id,
        "created_at": datetime.now().isoformat(),
        "total_items": len(plan_items),
        "items": plan_items,
        "phases": phase_summary,
        "conversion_guidelines": guidelines,
        "dependency_graph": dep_graph,
    }

    plan_path = Path(output_dir) / "conversion_plan.json"
    plan_path.parent.mkdir(parents=True, exist_ok=True)
    plan_path.write_text(json.dumps(plan, indent=2, default=str))

    return plan
