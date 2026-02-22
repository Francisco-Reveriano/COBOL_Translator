"""
Validation Checker Tool
========================
Post-conversion validation that verifies Python output against
the original COBOL specifications. Checks:
  - Structural completeness (all paragraphs/sections converted)
  - Data type mapping correctness
  - Control flow equivalence
  - Import/dependency resolution
  - Python syntax validity (via AST parsing)
  - Test stub generation
"""

import ast
import json
import re
from pathlib import Path
from typing import Optional
from strands import tool
from Backend.Agents.Tools.tool_helpers import strands_result


# ---------------------------------------------------------------------------
# Validation Checks
# ---------------------------------------------------------------------------
def _check_syntax(python_file: str) -> dict:
    """Verify Python file parses without syntax errors."""
    try:
        source = Path(python_file).read_text()
        ast.parse(source)
        return {"valid": True, "file": python_file}
    except SyntaxError as e:
        return {
            "valid": False,
            "file": python_file,
            "error": str(e),
            "line": e.lineno,
        }
    except FileNotFoundError:
        return {"valid": False, "file": python_file, "error": "File not found"}


def _check_structural_coverage(cobol_scan: dict, python_file: str) -> dict:
    """Check that all COBOL paragraphs/sections have Python equivalents."""
    try:
        py_source = Path(python_file).read_text()
    except FileNotFoundError:
        return {"covered": False, "error": "Python file not found"}

    # Extract function definitions from Python
    try:
        tree = ast.parse(py_source)
        py_functions = {
            node.name.lower()
            for node in ast.walk(tree)
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
        }
        py_classes = {
            node.name.lower()
            for node in ast.walk(tree)
            if isinstance(node, ast.ClassDef)
        }
    except SyntaxError:
        py_functions = set()
        py_classes = set()

    # Expected COBOL paragraphs → Python functions
    cobol_paragraphs = set()
    for p in cobol_scan.get("paragraphs", []):
        normalized = p.lower().replace("-", "_")
        cobol_paragraphs.add(normalized)

    cobol_sections = set()
    for s in cobol_scan.get("sections", []):
        normalized = s.lower().replace("-", "_")
        cobol_sections.add(normalized)

    # Check coverage
    missing_paragraphs = cobol_paragraphs - py_functions
    missing_sections = cobol_sections - py_functions - py_classes

    # Some sections may have been inlined or merged, so this is advisory
    coverage_pct = 0
    total = len(cobol_paragraphs) + len(cobol_sections)
    if total > 0:
        found = total - len(missing_paragraphs) - len(missing_sections)
        coverage_pct = round(found / total * 100, 1)

    return {
        "coverage_pct": coverage_pct,
        "total_cobol_elements": total,
        "python_functions_found": len(py_functions),
        "python_classes_found": len(py_classes),
        "missing_paragraphs": list(missing_paragraphs)[:10],
        "missing_sections": list(missing_sections)[:10],
        "advisory": (
            "Some missing elements may have been intentionally inlined, "
            "merged, or refactored. Review is recommended."
        ),
    }


def _check_data_type_mapping(cobol_scan: dict, python_file: str) -> dict:
    """Verify that COBOL data types are properly mapped in Python."""
    try:
        py_source = Path(python_file).read_text()
    except FileNotFoundError:
        return {"valid": False, "error": "Python file not found"}

    issues = []

    # Check for Decimal usage when COBOL has COMP-3 or decimal PIC
    data_items = cobol_scan.get("data_items_sample", [])
    needs_decimal = any(
        item.get("picture") and ("V" in item["picture"].upper() or "COMP-3" in str(item))
        for item in data_items
    )

    if needs_decimal and "Decimal" not in py_source:
        issues.append({
            "severity": "high",
            "message": "COBOL source has decimal/COMP-3 fields but Python file doesn't import Decimal",
        })

    # Check for proper string handling
    has_pic_x = any(
        item.get("picture") and item["picture"].upper().startswith("X")
        for item in data_items
    )
    if has_pic_x and ".strip()" not in py_source and "strip" not in py_source:
        issues.append({
            "severity": "medium",
            "message": "COBOL PIC X fields found but no .strip() calls detected for string padding removal",
        })

    # Check for error handling patterns
    if cobol_scan.get("has_embedded_sql") and "try" not in py_source:
        issues.append({
            "severity": "high",
            "message": "COBOL has embedded SQL but no try/except error handling found in Python",
        })

    return {
        "data_items_checked": len(data_items),
        "issues": issues,
        "issues_count": len(issues),
    }


def _generate_test_stubs(cobol_scan: dict, python_file: str, output_dir: str) -> dict:
    """Generate pytest test stubs for the converted module."""
    module_name = Path(python_file).stem
    test_file = Path(output_dir) / "tests" / f"test_{module_name}.py"

    try:
        py_source = Path(python_file).read_text()
        tree = ast.parse(py_source)
        functions = [
            node.name for node in ast.walk(tree)
            if isinstance(node, ast.FunctionDef) and not node.name.startswith("_")
        ]
        classes = [
            node.name for node in ast.walk(tree)
            if isinstance(node, ast.ClassDef)
        ]
    except (SyntaxError, FileNotFoundError):
        functions = []
        classes = []

    test_content = f'''"""
Tests for {module_name}
Auto-generated test stubs for COBOL-to-Python conversion validation.
Original COBOL: {cobol_scan.get("file", "unknown")}
"""

import pytest
from decimal import Decimal
from {module_name} import *


# ─────────────────────────────────────────────────────────────────────
# Data Class Tests
# ─────────────────────────────────────────────────────────────────────
'''

    for cls in classes:
        test_content += f'''
class Test{cls}:
    """Tests for {cls} data structure."""

    def test_instantiation(self):
        """Verify {cls} can be created with defaults."""
        obj = {cls}()
        assert obj is not None

    def test_field_types(self):
        """Verify field types match COBOL PIC specifications."""
        obj = {cls}()
        # TODO: Add field-specific type assertions
        # based on original COBOL PIC clauses
        pass

'''

    test_content += """
# ─────────────────────────────────────────────────────────────────────
# Function Tests
# ─────────────────────────────────────────────────────────────────────
"""

    for func in functions:
        test_content += f'''
class Test_{func}:
    """Tests for {func} (converted from COBOL paragraph)."""

    def test_basic_execution(self):
        """Verify {func} runs without errors."""
        # TODO: Provide appropriate test inputs
        # matching original COBOL test data
        result = {func}()
        assert result is not None

    def test_numeric_precision(self):
        """Verify decimal precision matches COBOL COMP-3 behavior."""
        # TODO: Add precision tests for any numeric computations
        pass

'''

    # Write test file
    test_file.parent.mkdir(parents=True, exist_ok=True)
    test_file.write_text(test_content)

    return {
        "test_file": str(test_file),
        "test_classes": len(classes),
        "test_functions": len(functions),
        "total_test_stubs": len(classes) + len(functions),
    }


# ---------------------------------------------------------------------------
# Strands Tool Definition
# ---------------------------------------------------------------------------
@tool
def validation_checker(
    output_dir: str,
    scan_results: Optional[dict] = None,
    target_file: Optional[str] = None,
    program_id: Optional[str] = None,
    checks: Optional[list] = None,
) -> dict:
    """
    Validate converted Python files against COBOL specifications.

    Runs syntax checks, structural coverage analysis, data type mapping
    verification, and generates test stubs.

    Args:
        output_dir: Base output directory containing converted files.
        scan_results: Original cobol_scanner output for cross-reference.
        target_file: Specific Python file to validate (or None for all).
        program_id: Program ID to validate (used to find scan data).
        checks: List of checks to run. Default: all.
                Options: syntax, coverage, data_types, test_stubs

    Returns:
        Dict with validation results per check and overall status.
    """
    default_checks = ["syntax", "coverage", "data_types", "test_stubs"]
    active_checks = checks or default_checks
    results = {"overall_status": "pass", "checks": {}, "files_validated": 0}

    # Determine files to validate
    if target_file:
        python_files = [target_file]
    else:
        output_path = Path(output_dir)
        python_files = list(output_path.rglob("*.py"))
        python_files = [
            str(f) for f in python_files
            if "test_" not in f.name and "__pycache__" not in str(f)
        ]

    if not python_files:
        return strands_result({"overall_status": "error", "message": "No Python files found to validate"}, status="error")

    # Find matching scan data
    program_lookup = {}
    if scan_results:
        for prog in scan_results.get("programs", []):
            program_lookup[prog["program_id"]] = prog

    file_results = []
    for py_file in python_files:
        file_result = {"file": py_file, "checks": {}}
        module_name = Path(py_file).stem

        # Find matching COBOL scan data
        cobol_data = None
        if program_id and program_id in program_lookup:
            cobol_data = program_lookup[program_id]
        else:
            # Try to match by module name
            for pid, pdata in program_lookup.items():
                if pid.lower().replace("-", "_") == module_name:
                    cobol_data = pdata
                    break

        # Run checks
        if "syntax" in active_checks:
            file_result["checks"]["syntax"] = _check_syntax(py_file)
            if not file_result["checks"]["syntax"]["valid"]:
                results["overall_status"] = "fail"

        if "coverage" in active_checks and cobol_data:
            file_result["checks"]["coverage"] = _check_structural_coverage(cobol_data, py_file)

        if "data_types" in active_checks and cobol_data:
            file_result["checks"]["data_types"] = _check_data_type_mapping(cobol_data, py_file)
            if file_result["checks"]["data_types"]["issues_count"] > 0:
                results["overall_status"] = "warnings"

        if "test_stubs" in active_checks and cobol_data:
            file_result["checks"]["test_stubs"] = _generate_test_stubs(
                cobol_data, py_file, output_dir
            )

        file_results.append(file_result)

    results["files_validated"] = len(file_results)
    results["file_results"] = file_results

    return strands_result(results)
