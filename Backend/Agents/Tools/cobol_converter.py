"""
COBOL Converter Tool
=====================
Converts a single COBOL program/copybook to Python using the
conversion plan's instructions. The tool:

  1. Reads the source COBOL file
  2. Applies conversion rules from the plan item
  3. Generates Python output with proper structure
  4. Writes the output file to the target path

The actual COBOL→Python translation is done by the LLM (Claude via Bedrock).
This tool provides the structured context and file I/O scaffolding,
then delegates the intelligent conversion to the model through the agent loop.
"""

import os
import json
from pathlib import Path
from datetime import datetime
from typing import Optional
from strands import tool
from Backend.Agents.Tools.tool_helpers import strands_result, markdown_result, ConversionContext


# ---------------------------------------------------------------------------
# Conversion Templates
# ---------------------------------------------------------------------------
PYTHON_MODULE_HEADER = '''"""
{module_name}
{separator}
Auto-converted from COBOL: {source_file}
Conversion date: {date}
Original program ID: {program_id}

COBOL Source Structure:
  Divisions: {divisions}
  Sections:  {sections}
  Lines of Code: {loc}

Conversion Notes:
  {notes}
"""

from __future__ import annotations
from dataclasses import dataclass, field
from decimal import Decimal, ROUND_HALF_UP
from typing import Optional, Union
from pathlib import Path
import logging

logger = logging.getLogger(__name__)

'''

PYTHON_DATACLASS_TEMPLATE = '''
@dataclass
class {class_name}:
    """{description}"""
{fields}
'''

PYTHON_FUNCTION_TEMPLATE = '''
def {func_name}({params}) -> {return_type}:
    """{docstring}

    Original COBOL: {cobol_reference}
    """
{body}
'''


def _cobol_name_to_python(name: str) -> str:
    """Convert COBOL-STYLE-NAME to python_style_name."""
    return name.lower().replace("-", "_").replace(" ", "_")


def _pic_to_python_type(pic: str) -> str:
    """Map COBOL PIC clause to Python type hint."""
    if not pic:
        return "str"

    pic_upper = pic.upper()

    # Numeric with decimal
    if "V" in pic_upper or "." in pic_upper:
        return "Decimal"

    # Pure numeric
    if pic_upper.startswith(("9", "S9")):
        # Check for COMP-3 / packed decimal
        return "int"

    # Alphanumeric
    if pic_upper.startswith(("X", "A")):
        return "str"

    return "str"


def _generate_data_classes(data_items: list[dict]) -> str:
    """Generate Python dataclasses from COBOL data items."""
    if not data_items:
        return ""

    classes = []
    current_group = None
    current_fields = []

    for item in data_items:
        level = int(item.get("level", "77"))
        name = _cobol_name_to_python(item["name"])
        pic = item.get("picture")

        if level <= 5:
            # New group - flush previous
            if current_group and current_fields:
                fields_str = "\n".join(f"    {f}" for f in current_fields)
                classes.append(
                    f"@dataclass\n"
                    f"class {current_group.title().replace('_', '')}Record:\n"
                    f'    """COBOL group level record."""\n'
                    f"{fields_str}\n"
                )
            current_group = name
            current_fields = []
        elif pic:
            py_type = _pic_to_python_type(pic)
            default = '""' if py_type == "str" else "0" if py_type == "int" else "Decimal(0)"
            current_fields.append(f"{name}: {py_type} = {default}  # PIC {pic}")

    # Flush last group
    if current_group and current_fields:
        fields_str = "\n".join(f"    {f}" for f in current_fields)
        classes.append(
            f"@dataclass\n"
            f"class {current_group.title().replace('_', '')}Record:\n"
            f'    """COBOL group level record."""\n'
            f"{fields_str}\n"
        )

    return "\n\n".join(classes)


# ---------------------------------------------------------------------------
# Strands Tool Definition
# ---------------------------------------------------------------------------
@tool
def cobol_converter(
    source_file: str,
    target_file: str,
    program_id: str,
    item_id: str,
    output_dir: str = "./output",
) -> dict:
    """
    Convert a single COBOL program to Python.

    Reads the COBOL source, loads conversion notes from the plan file,
    generates a structured Python module scaffold, and writes it to the target path.
    The LLM handles the intelligent translation; this tool provides
    the scaffolding, file I/O, and structural templates.

    Args:
        source_file: Path to the COBOL source file.
        target_file: Path where the Python output should be written.
        program_id: COBOL PROGRAM-ID for the module being converted.
        item_id: ID of the plan item being executed (for tracking).
        output_dir: Base output directory (contains conversion_plan.json).

    Returns:
        Markdown with COBOL source, conversion notes, scaffolding info,
        and instructions to generate the full Python module.
    """
    source_path = Path(source_file)
    target_path = Path(target_file)

    # Read COBOL source
    if not source_path.exists():
        return strands_result({
            "error": f"Source file not found: {source_file}",
            "item_id": item_id,
        }, status="error")

    cobol_source = source_path.read_text(encoding="utf-8", errors="replace")

    # Load conversion notes from in-memory context (falls back to disk)
    conversion_notes = {}
    ctx = ConversionContext.instance()
    plan_file = str(Path(output_dir) / "conversion_plan.json")
    plan = ctx.get("conversion_plan", fallback_path=plan_file)
    if plan:
        for item in plan.get("items", []):
            if item["id"] == item_id:
                conversion_notes = item.get("conversion_notes", {})
                break

    # Parse basic structure for scaffolding
    lines = cobol_source.split("\n")
    clean_lines = [
        line for line in lines
        if line.strip() and not (len(line) > 6 and line[6] == "*")
    ]

    # Extract divisions and sections for documentation
    divisions = []
    sections = []
    for line in clean_lines:
        upper = line.upper().strip()
        if "DIVISION" in upper and "." in upper:
            divisions.append(upper.split("DIVISION")[0].strip().split()[-1] if upper.split("DIVISION")[0].strip() else "")
        if "SECTION" in upper and "." in upper:
            parts = upper.split("SECTION")[0].strip()
            if parts:
                sections.append(parts.split()[-1])

    # Generate module header
    module_name = _cobol_name_to_python(program_id)
    header = PYTHON_MODULE_HEADER.format(
        module_name=module_name,
        separator="=" * len(module_name),
        source_file=source_file,
        date=datetime.now().strftime("%Y-%m-%d"),
        program_id=program_id,
        divisions=", ".join(divisions) if divisions else "N/A",
        sections=", ".join(sections) if sections else "N/A",
        loc=len(clean_lines),
        notes=json.dumps(conversion_notes, indent=2, default=str)[:500],
    )

    # Ensure target directory exists
    target_path.parent.mkdir(parents=True, exist_ok=True)

    # Write a placeholder that the LLM will refine
    placeholder = header + f"""
# ─────────────────────────────────────────────────────────────────────
# TODO: Complete conversion from COBOL source
# Source: {source_file}
# Lines: {len(clean_lines)}
# ─────────────────────────────────────────────────────────────────────

# The agent will generate the full Python conversion in the next step.
"""
    target_path.write_text(placeholder)

    # Build markdown for the LLM (truncate COBOL to reduce context bloat)
    MAX_COBOL_PREVIEW_LINES = 150
    cobol_lines = cobol_source.split("\n")
    if len(cobol_lines) > MAX_COBOL_PREVIEW_LINES:
        truncated_source = "\n".join(cobol_lines[:MAX_COBOL_PREVIEW_LINES])
        truncation_note = f"\n... ({len(cobol_lines) - MAX_COBOL_PREVIEW_LINES} more lines — full source at `{source_file}`)"
    else:
        truncated_source = cobol_source
        truncation_note = ""

    md_lines = [
        f"## Convert: {program_id}",
        f"- **Source:** `{source_file}` ({len(clean_lines)} LOC)",
        f"- **Target:** `{target_file}`",
        f"- **item_id:** {item_id}",
        "",
        "### COBOL Source",
        "```cobol",
        truncated_source + truncation_note,
        "```",
        "",
    ]

    # Conversion notes as bullet points
    if conversion_notes:
        md_lines.append("### Conversion Notes")
        for key, val in conversion_notes.items():
            if val:
                md_lines.append(f"- **{key}:** {val}")
        md_lines.append("")

    # Scaffolding info
    md_lines.extend([
        "### Python Scaffolding",
        "- **Imports:** `dataclasses`, `Decimal`, `typing`, `pathlib`, `logging`",
        "- **Naming:** COBOL-NAME -> snake_case",
        "- **Type mapping:** PIC X->str, PIC 9->int, PIC 9V9->Decimal, COMP-3->Decimal",
        "- **Control flow:** PERFORM->function call, PERFORM UNTIL->while, EVALUATE->match/case",
        "",
        f"Generate the complete Python module and write it to `{target_file}`.",
    ])

    return markdown_result("\n".join(md_lines))


# ---------------------------------------------------------------------------
# Refinement Tool — iterates on scored output until quality >= 95
# ---------------------------------------------------------------------------
@tool
def cobol_refiner(
    source_file: str,
    target_file: str,
    program_id: str,
    attempt: int,
    output_dir: str = "./output",
) -> dict:
    """
    Refine a previously converted Python module using quality scorer feedback.

    Called when a module's quality score is below 95.0. Reads the latest score
    from {output_dir}/scores/{program_id}.json (written by quality_scorer),
    then provides the issues and remediation context so the agent can generate
    an improved version.

    Args:
        source_file: Path to the original COBOL source file.
        target_file: Path to the current Python output to improve.
        program_id: COBOL PROGRAM-ID for the module being refined.
        attempt: Current refinement attempt number (1-based, max 3).
        output_dir: Base output directory (contains scores/{program_id}.json).

    Returns:
        Markdown with current score, issues, current Python, original COBOL,
        and instructions to fix all issues.
    """
    source_path = Path(source_file)
    target_path = Path(target_file)

    if not source_path.exists():
        return strands_result({
            "error": f"COBOL source not found: {source_file}",
        }, status="error")

    # Load latest score from file (written by quality_scorer)
    score_file = Path(output_dir) / "scores" / f"{program_id}.json"
    if not score_file.exists():
        return strands_result({
            "error": f"Score file not found: {score_file}. Run quality_scorer first.",
        }, status="error")
    score_result = json.loads(score_file.read_text())

    cobol_source = source_path.read_text(encoding="utf-8", errors="replace")

    current_python = ""
    if target_path.exists():
        current_python = target_path.read_text(encoding="utf-8", errors="replace")

    overall = score_result.get("overall", 0)
    scores = score_result.get("scores", {})
    issues = score_result.get("issues", [])
    gap = round(95.0 - overall, 1)

    # Build markdown for the LLM
    md_lines = [
        f"## Refinement: {program_id} (attempt {attempt}/3)",
        f"- **Current score:** {overall} | **Target:** 95.0 | **Gap:** {gap}",
        "",
        "### Dimension Scores",
        "| Dimension | Score |",
        "|---|---|",
    ]
    for dim, val in scores.items():
        md_lines.append(f"| {dim.replace('_', ' ').title()} | {val} |")

    if issues:
        md_lines.append("")
        md_lines.append("### Issues to Fix")
        for i, issue in enumerate(issues, 1):
            sev = issue.get("severity", "info").upper()
            dim = issue.get("dimension", "")
            desc = issue.get("description", "")
            line = issue.get("line")
            rem = issue.get("remediation", "")
            line_ref = f" (line {line})" if line else ""
            md_lines.append(f"{i}. **[{sev}]** {dim}{line_ref}: {desc}")
            if rem:
                md_lines.append(f"   - Fix: {rem}")

    md_lines.extend([
        "",
        "### Current Python Output",
        "```python",
        current_python,
        "```",
        "",
        "### Original COBOL Source",
        "```cobol",
        cobol_source,
        "```",
        "",
        f"Fix all issues and write the improved module to `{target_file}`.",
    ])

    return markdown_result("\n".join(md_lines))
