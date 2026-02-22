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
from Backend.Agents.Tools.tool_helpers import strands_result


# ---------------------------------------------------------------------------
# Conversion Templates
# ---------------------------------------------------------------------------
PYTHON_MODULE_HEADER = '''"""
{module_name}
{'=' * len('{module_name}')}
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
    conversion_notes: dict,
    plan_item_id: str,
    output_dir: str = "./output",
) -> dict:
    """
    Convert a single COBOL program to Python.

    Reads the COBOL source, applies conversion rules from the plan,
    generates a structured Python module, and writes it to the target path.
    The LLM handles the intelligent translation; this tool provides
    the scaffolding, file I/O, and structural templates.

    Args:
        source_file: Path to the COBOL source file.
        target_file: Path where the Python output should be written.
        program_id: COBOL PROGRAM-ID for the module being converted.
        conversion_notes: Detailed conversion instructions from the plan.
        plan_item_id: ID of the plan item being executed (for tracking).
        output_dir: Base output directory.

    Returns:
        Dict with conversion result including the generated Python code
        context for the LLM to refine, file paths, and metadata.
    """
    source_path = Path(source_file)
    target_path = Path(target_file)

    # Read COBOL source
    if not source_path.exists():
        return strands_result({
            "success": False,
            "error": f"Source file not found: {source_file}",
            "plan_item_id": plan_item_id,
        }, status="error")

    cobol_source = source_path.read_text(encoding="utf-8", errors="replace")

    # Parse basic structure for scaffolding
    lines = cobol_source.split("\n")
    clean_lines = [
        line for line in lines
        if line.strip() and not (len(line) > 6 and line[6] == "*")
    ]

    # Extract divisions and sections for documentation
    divisions = []
    sections = []
    paragraphs = []
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
        source_file=source_file,
        date=datetime.now().strftime("%Y-%m-%d"),
        program_id=program_id,
        divisions=", ".join(divisions) if divisions else "N/A",
        sections=", ".join(sections) if sections else "N/A",
        loc=len(clean_lines),
        notes=json.dumps(conversion_notes, indent=2, default=str)[:500],
    )

    # Build conversion context for the LLM
    # The agent will use this context to generate the actual Python code
    conversion_context = {
        "cobol_source": cobol_source,
        "cobol_source_lines": len(clean_lines),
        "module_header": header,
        "target_module_name": module_name,
        "conversion_notes": conversion_notes,
        "python_scaffolding": {
            "imports": [
                "from __future__ import annotations",
                "from dataclasses import dataclass, field",
                "from decimal import Decimal, ROUND_HALF_UP",
                "from typing import Optional, Union",
                "from pathlib import Path",
                "import logging",
            ],
            "naming_convention": "snake_case (COBOL-NAME → cobol_name)",
            "type_mapping": {
                "PIC X(n)": "str",
                "PIC 9(n)": "int",
                "PIC 9(n)V9(m)": "Decimal",
                "PIC S9(n) COMP": "int",
                "PIC S9(n) COMP-3": "Decimal",
                "FILLER": "# skip or bytes padding",
            },
            "control_flow_mapping": {
                "PERFORM paragraph": "function_call()",
                "PERFORM UNTIL condition": "while not condition:",
                "PERFORM VARYING": "for i in range(start, stop, step):",
                "EVALUATE / WHEN": "match value: case pattern:",
                "IF / ELSE": "if condition: ... else:",
                "GO TO": "# Refactor to structured control flow",
            },
        },
    }

    # Ensure target directory exists
    target_path.parent.mkdir(parents=True, exist_ok=True)

    # Write a placeholder that the LLM will refine
    # The agent's next turn will generate the actual conversion
    placeholder = header + f"""
# ─────────────────────────────────────────────────────────────────────
# TODO: Complete conversion from COBOL source
# Source: {source_file}
# Lines: {len(clean_lines)}
# ─────────────────────────────────────────────────────────────────────

# The agent will generate the full Python conversion in the next step.
# Conversion notes have been provided in the context above.
"""
    target_path.write_text(placeholder)

    return strands_result({
        "success": True,
        "plan_item_id": plan_item_id,
        "program_id": program_id,
        "source_file": source_file,
        "target_file": target_file,
        "cobol_lines": len(clean_lines),
        "conversion_context": conversion_context,
        "message": (
            f"COBOL source loaded ({len(clean_lines)} lines). "
            f"Scaffolding written to {target_file}. "
            f"Please now generate the full Python conversion using the "
            f"conversion_context provided. Write the complete Python module "
            f"that faithfully translates the COBOL logic, then save it to {target_file}."
        ),
    })


# ---------------------------------------------------------------------------
# Refinement Tool — iterates on scored output until quality >= 95
# ---------------------------------------------------------------------------
@tool
def cobol_refiner(
    source_file: str,
    target_file: str,
    program_id: str,
    score_result: dict,
    attempt: int,
    output_dir: str = "./output",
) -> dict:
    """
    Refine a previously converted Python module using quality scorer feedback.

    Called when a module's quality score is below 95.0. Reads the current
    Python output and the original COBOL source, then provides the scorer's
    issues and remediation suggestions as structured context so the agent
    can generate an improved version.

    Args:
        source_file: Path to the original COBOL source file.
        target_file: Path to the current Python output to improve.
        program_id: COBOL PROGRAM-ID for the module being refined.
        score_result: The quality_scorer result dict containing 'scores',
                      'overall', 'issues', and 'summary'.
        attempt: Current refinement attempt number (1-based, max 3).
        output_dir: Base output directory.

    Returns:
        Dict with the COBOL source, current Python code, and formatted
        fix instructions for the agent to generate an improved version.
    """
    source_path = Path(source_file)
    target_path = Path(target_file)

    if not source_path.exists():
        return strands_result({
            "error": f"COBOL source not found: {source_file}",
        }, status="error")

    cobol_source = source_path.read_text(encoding="utf-8", errors="replace")

    current_python = ""
    if target_path.exists():
        current_python = target_path.read_text(encoding="utf-8", errors="replace")

    overall = score_result.get("overall", 0)
    scores = score_result.get("scores", {})
    issues = score_result.get("issues", [])
    summary = score_result.get("summary", "")

    fix_instructions = []
    for i, issue in enumerate(issues, 1):
        severity = issue.get("severity", "info")
        dimension = issue.get("dimension", "")
        description = issue.get("description", "")
        line = issue.get("line")
        remediation = issue.get("remediation", "")
        line_ref = f" (line {line})" if line else ""
        fix_instructions.append(
            f"{i}. [{severity.upper()}] {dimension}{line_ref}: {description}\n"
            f"   Fix: {remediation}"
        )

    return strands_result({
        "program_id": program_id,
        "attempt": attempt,
        "max_attempts": 3,
        "current_overall_score": overall,
        "target_score": 95.0,
        "score_gap": round(95.0 - overall, 1),
        "dimension_scores": scores,
        "scorer_summary": summary,
        "cobol_source": cobol_source,
        "current_python_output": current_python,
        "fix_instructions": "\n".join(fix_instructions),
        "issue_count": len(issues),
        "message": (
            f"Refinement attempt {attempt}/3 for {program_id}. "
            f"Current score: {overall} (target: 95.0, gap: {round(95.0 - overall, 1)}). "
            f"{len(issues)} issues to address. "
            f"Please carefully review each issue below, apply the suggested fixes "
            f"to the Python code, and generate a complete improved version. "
            f"Focus on the highest-severity issues first. "
            f"Write the improved module to {target_file}."
        ),
    })
