"""
COBOL Scanner Tool
==================
Scans a directory of COBOL source files, parses their structure,
and builds a dependency graph for the conversion planner.

Extracts:
  - Program IDs, divisions, sections
  - COPY/INCLUDE dependencies
  - CALL statements (inter-program calls)
  - Data definitions (WORKING-STORAGE, FILE SECTION)
  - Paragraph/section flow
"""

import os
import re
import json
from pathlib import Path
from typing import Any
from strands import tool


# ---------------------------------------------------------------------------
# COBOL Parsing Helpers
# ---------------------------------------------------------------------------
COBOL_EXTENSIONS = {".cbl", ".cob", ".cpy", ".cob", ".cobol", ".pco"}

# Regex patterns for COBOL structure extraction
PATTERNS = {
    "program_id": re.compile(r"PROGRAM-ID\.\s+(\S+)", re.IGNORECASE),
    "copy": re.compile(r"COPY\s+(\S+?)\.?(?:\s|$)", re.IGNORECASE),
    "call": re.compile(r"CALL\s+['\"](\S+?)['\"]", re.IGNORECASE),
    "division": re.compile(r"^.{6}\s+(\w[\w\-]+)\s+DIVISION", re.IGNORECASE | re.MULTILINE),
    "section": re.compile(r"^.{6}\s+(\w[\w\-]+)\s+SECTION", re.IGNORECASE | re.MULTILINE),
    "paragraph": re.compile(r"^.{6}\s+(\w[\w\-]+)\.\s*$", re.IGNORECASE | re.MULTILINE),
    "file_select": re.compile(r"SELECT\s+(\S+)\s+ASSIGN\s+TO\s+(\S+)", re.IGNORECASE),
    "working_storage": re.compile(
        r"(\d{2})\s+([\w\-]+)(?:\s+PIC(?:TURE)?\s+(\S+))?",
        re.IGNORECASE,
    ),
    "perform": re.compile(r"PERFORM\s+([\w\-]+)", re.IGNORECASE),
    "sql_exec": re.compile(r"EXEC\s+SQL", re.IGNORECASE),
    "cics_exec": re.compile(r"EXEC\s+CICS", re.IGNORECASE),
}


def parse_cobol_file(filepath: str) -> dict:
    """Parse a single COBOL file and extract structural metadata."""
    content = Path(filepath).read_text(encoding="utf-8", errors="replace")

    # Remove sequence number area (cols 1-6) and comment lines
    lines = content.split("\n")
    cleaned_lines = []
    for line in lines:
        if len(line) > 6 and line[6] != "*":
            cleaned_lines.append(line)
    cleaned = "\n".join(cleaned_lines)

    program_id_match = PATTERNS["program_id"].search(cleaned)
    program_id = program_id_match.group(1).strip(".") if program_id_match else Path(filepath).stem

    # Extract structural elements
    divisions = [m.group(1) for m in PATTERNS["division"].finditer(cleaned)]
    sections = [m.group(1) for m in PATTERNS["section"].finditer(cleaned)]
    paragraphs = [m.group(1) for m in PATTERNS["paragraph"].finditer(cleaned)]
    copy_deps = list(set(m.group(1).strip(".") for m in PATTERNS["copy"].finditer(cleaned)))
    call_deps = list(set(m.group(1) for m in PATTERNS["call"].finditer(cleaned)))
    performs = list(set(m.group(1) for m in PATTERNS["perform"].finditer(cleaned)))
    file_selects = [
        {"name": m.group(1), "assign_to": m.group(2)}
        for m in PATTERNS["file_select"].finditer(cleaned)
    ]

    # Extract data definitions (level numbers, names, PIC clauses)
    data_items = []
    for m in PATTERNS["working_storage"].finditer(cleaned):
        level, name, pic = m.group(1), m.group(2), m.group(3)
        if name.upper() not in {"DIVISION", "SECTION", "PROCEDURE", "DATA", "WORKING-STORAGE"}:
            data_items.append({
                "level": level,
                "name": name,
                "picture": pic or None,
            })

    # Detect embedded SQL / CICS
    has_sql = bool(PATTERNS["sql_exec"].search(cleaned))
    has_cics = bool(PATTERNS["cics_exec"].search(cleaned))

    # Complexity metrics
    loc = len([l for l in lines if l.strip() and not (len(l) > 6 and l[6] == "*")])

    return {
        "file": filepath,
        "program_id": program_id,
        "divisions": divisions,
        "sections": sections,
        "paragraphs": paragraphs,
        "copy_dependencies": copy_deps,
        "call_dependencies": call_deps,
        "performs": performs,
        "file_definitions": file_selects,
        "data_items_count": len(data_items),
        "data_items_sample": data_items[:20],  # first 20 for context
        "has_embedded_sql": has_sql,
        "has_cics": has_cics,
        "lines_of_code": loc,
        "complexity": _estimate_complexity(loc, has_sql, has_cics, len(call_deps), len(data_items)),
    }


def _estimate_complexity(loc: int, has_sql: bool, has_cics: bool, calls: int, data_items: int) -> str:
    """Rough complexity classification for planning purposes."""
    score = 0
    score += min(loc // 100, 5)
    score += 3 if has_sql else 0
    score += 4 if has_cics else 0
    score += min(calls, 3)
    score += min(data_items // 50, 3)

    if score <= 3:
        return "low"
    elif score <= 7:
        return "medium"
    elif score <= 12:
        return "high"
    else:
        return "critical"


def build_dependency_graph(scan_results: list[dict]) -> dict:
    """Build a graph of inter-program dependencies from scan results."""
    programs = {r["program_id"]: r for r in scan_results}
    graph = {"nodes": [], "edges": []}

    for prog_id, info in programs.items():
        graph["nodes"].append({
            "id": prog_id,
            "file": info["file"],
            "complexity": info["complexity"],
            "loc": info["lines_of_code"],
        })
        for dep in info["call_dependencies"]:
            graph["edges"].append({"from": prog_id, "to": dep, "type": "CALL"})
        for dep in info["copy_dependencies"]:
            graph["edges"].append({"from": prog_id, "to": dep, "type": "COPY"})

    return graph


# ---------------------------------------------------------------------------
# Strands Tool Definition
# ---------------------------------------------------------------------------
@tool
def cobol_scanner(directory: str) -> dict:
    """
    Scan a directory of COBOL source files and return structural analysis.

    Analyzes all .cbl, .cob, .cpy files to extract:
    - Program structure (divisions, sections, paragraphs)
    - Inter-program dependencies (CALL, COPY)
    - Data definitions and file I/O
    - Embedded SQL/CICS detection
    - Complexity estimation per program

    Args:
        directory: Path to directory containing COBOL source files.

    Returns:
        Dict with 'programs' (list of parsed files), 'dependency_graph',
        and 'summary' statistics.
    """
    dir_path = Path(directory)
    if not dir_path.exists():
        return {"error": f"Directory not found: {directory}"}

    # Find all COBOL files
    cobol_files = []
    for ext in COBOL_EXTENSIONS:
        cobol_files.extend(dir_path.rglob(f"*{ext}"))

    if not cobol_files:
        return {"error": f"No COBOL files found in {directory}", "extensions_checked": list(COBOL_EXTENSIONS)}

    # Parse each file
    scan_results = []
    errors = []
    for f in sorted(cobol_files):
        try:
            result = parse_cobol_file(str(f))
            scan_results.append(result)
        except Exception as e:
            errors.append({"file": str(f), "error": str(e)})

    # Build dependency graph
    dep_graph = build_dependency_graph(scan_results)

    # Summary statistics
    total_loc = sum(r["lines_of_code"] for r in scan_results)
    complexity_dist = {}
    for r in scan_results:
        c = r["complexity"]
        complexity_dist[c] = complexity_dist.get(c, 0) + 1

    summary = {
        "total_files": len(scan_results),
        "total_lines_of_code": total_loc,
        "complexity_distribution": complexity_dist,
        "programs_with_sql": sum(1 for r in scan_results if r["has_embedded_sql"]),
        "programs_with_cics": sum(1 for r in scan_results if r["has_cics"]),
        "total_copy_dependencies": sum(len(r["copy_dependencies"]) for r in scan_results),
        "total_call_dependencies": sum(len(r["call_dependencies"]) for r in scan_results),
        "scan_errors": len(errors),
    }

    return {
        "programs": scan_results,
        "dependency_graph": dep_graph,
        "summary": summary,
        "errors": errors,
    }
