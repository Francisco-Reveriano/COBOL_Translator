"""
Quality Scorer Tool (GPT-5.2-Codex)
=====================================
Independent sequential quality checker using OpenAI GPT-5.2-Codex.
Scores each converted module on 4 dimensions before the agent proceeds.

Scoring Rubric (PRD Section 5.3.1):
  - Correctness     (35%): Logic equivalence, data types, control flow, arithmetic
  - Completeness    (25%): All paragraphs, no skipped sections, COPY coverage, I/O
  - Maintainability (20%): Type hints, docstrings, naming, structure
  - Banking Compliance (20%): Decimal precision, audit logging, error handling

Thresholds: Green >= 85, Yellow 70-84, Red < 70

Features:
  - Structured output enforcement via OpenAI JSON schema (FR-3.6)
  - Reasoning effort: high (FR-3.7)
  - Content-hash caching to avoid re-scoring identical pairs (FR-3.10)
  - AST-based fallback if OpenAI is unreachable (FR-3.11)
"""

import ast
import hashlib
import json
import logging
import os
import re
from pathlib import Path
from typing import Any, Optional

from strands import tool

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Scoring Constants
# ---------------------------------------------------------------------------
WEIGHTS = {
    "correctness": 0.35,
    "completeness": 0.25,
    "maintainability": 0.20,
    "banking_compliance": 0.20,
}

SCORE_MODEL = os.getenv("QUALITY_SCORE_MODEL", "gpt-5.2-codex")

# ---------------------------------------------------------------------------
# OpenAI Structured Output Schema (PRD Section 5.3.2, FR-3.6)
# ---------------------------------------------------------------------------
SCORE_JSON_SCHEMA = {
    "name": "quality_score",
    "strict": True,
    "schema": {
        "type": "object",
        "properties": {
            "module": {"type": "string"},
            "scores": {
                "type": "object",
                "properties": {
                    "correctness": {"type": "integer"},
                    "completeness": {"type": "integer"},
                    "maintainability": {"type": "integer"},
                    "banking_compliance": {"type": "integer"},
                },
                "required": ["correctness", "completeness", "maintainability", "banking_compliance"],
                "additionalProperties": False,
            },
            "issues": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "severity": {"type": "string", "enum": ["critical", "warning", "info"]},
                        "dimension": {"type": "string"},
                        "description": {"type": "string"},
                        "line": {"type": ["integer", "null"]},
                        "remediation": {"type": ["string", "null"]},
                    },
                    "required": ["severity", "dimension", "description", "line", "remediation"],
                    "additionalProperties": False,
                },
            },
            "summary": {"type": "string"},
        },
        "required": ["module", "scores", "issues", "summary"],
        "additionalProperties": False,
    },
}

SCORING_SYSTEM_PROMPT = """You are a COBOL-to-Python conversion quality assessor.
You receive the original COBOL source, the converted Python output, and conversion notes.
Score the conversion on these 4 dimensions (each 0-100):

1. **Correctness** (35% weight): Logic equivalence, data type mapping accuracy,
   control flow fidelity, arithmetic precision (especially packed decimal / COMP-3).

2. **Completeness** (25% weight): All COBOL paragraphs/sections converted,
   no skipped logic, COPY book coverage, file I/O fully mapped.

3. **Maintainability** (20% weight): Type hints on all functions, docstrings
   referencing original COBOL elements, snake_case naming, clean structure.

4. **Banking Compliance** (20% weight): Decimal (not float) for monetary values,
   proper error handling, audit-ready logging, status code mapping.

For each issue found, provide severity (critical/warning/info), the dimension it
affects, a description, the Python line number if applicable, and a remediation
suggestion.

Be thorough but fair. A faithful translation with minor style issues should still
score well on Correctness and Completeness."""


# ---------------------------------------------------------------------------
# Content-Hash Cache (FR-3.10)
# ---------------------------------------------------------------------------
def _cache_key(cobol_source: str, python_output: str) -> str:
    """SHA-256 of (COBOL source + Python output) for cache lookup."""
    content = f"{cobol_source}\n---SEPARATOR---\n{python_output}"
    return hashlib.sha256(content.encode()).hexdigest()


def _get_cached_score(cache_dir: Path, key: str) -> Optional[dict]:
    """Return cached score if it exists."""
    cache_file = cache_dir / f"{key}.json"
    if cache_file.exists():
        try:
            return json.loads(cache_file.read_text())
        except (json.JSONDecodeError, OSError):
            return None
    return None


def _save_cached_score(cache_dir: Path, key: str, score: dict) -> None:
    """Persist score to cache."""
    cache_dir.mkdir(parents=True, exist_ok=True)
    cache_file = cache_dir / f"{key}.json"
    cache_file.write_text(json.dumps(score, indent=2, default=str))


# ---------------------------------------------------------------------------
# Weighted Score Calculation (FR-3.5)
# ---------------------------------------------------------------------------
def _compute_overall(scores: dict) -> float:
    """Compute weighted overall score."""
    total = sum(
        scores.get(dim, 0) * weight
        for dim, weight in WEIGHTS.items()
    )
    return round(total, 1)


def _determine_threshold(overall: float) -> str:
    """Map overall score to threshold color (FR-3.8)."""
    if overall >= 85:
        return "green"
    elif overall >= 70:
        return "yellow"
    return "red"


# ---------------------------------------------------------------------------
# GPT-5.2-Codex Scoring (FR-3.1)
# ---------------------------------------------------------------------------
def _score_with_codex(
    module_name: str,
    cobol_source: str,
    python_output: str,
    conversion_notes: str,
) -> dict:
    """Call GPT-5.2-Codex with structured output to score the conversion."""
    import openai

    client = openai.OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

    user_prompt = f"""## Module: {module_name}

### Original COBOL Source
```cobol
{cobol_source}
```

### Converted Python Output
```python
{python_output}
```

### Conversion Notes
{conversion_notes}

Score this COBOL-to-Python conversion on all 4 dimensions."""

    response = client.chat.completions.create(
        model=SCORE_MODEL,
        messages=[
            {"role": "system", "content": SCORING_SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
        response_format={
            "type": "json_schema",
            "json_schema": SCORE_JSON_SCHEMA,
        },
        reasoning_effort="high",  # FR-3.7
    )

    content = response.choices[0].message.content
    return json.loads(content)


# ---------------------------------------------------------------------------
# AST-Based Fallback Scorer (FR-3.11)
# ---------------------------------------------------------------------------
def _score_with_fallback(
    module_name: str,
    cobol_source: str,
    python_output: str,
) -> dict:
    """Rule-based AST fallback when OpenAI is unreachable."""
    issues = []
    scores = {
        "correctness": 0,
        "completeness": 0,
        "maintainability": 0,
        "banking_compliance": 0,
    }

    # --- Syntax check ---
    try:
        tree = ast.parse(python_output)
        scores["correctness"] = 70  # Base: valid syntax
    except SyntaxError as e:
        issues.append({
            "severity": "critical",
            "dimension": "correctness",
            "description": f"Python syntax error: {e}",
            "line": e.lineno,
            "remediation": "Fix the syntax error in the converted Python file.",
        })
        scores["correctness"] = 20
        tree = None

    # --- Completeness: paragraph coverage ---
    if tree:
        py_functions = {
            node.name.lower()
            for node in ast.walk(tree)
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
        }
        # Count COBOL paragraphs (rough heuristic)
        cobol_paragraphs = set()
        for line in cobol_source.split("\n"):
            stripped = line.strip()
            if (
                len(line) > 6
                and line[6] != "*"
                and stripped.endswith(".")
                and " " not in stripped.rstrip(".")
                and stripped.rstrip(".").replace("-", "").isalpha()
            ):
                cobol_paragraphs.add(stripped.rstrip(".").lower().replace("-", "_"))

        if cobol_paragraphs:
            covered = len(cobol_paragraphs & py_functions)
            coverage = covered / len(cobol_paragraphs) * 100
            scores["completeness"] = min(int(coverage), 100)
        else:
            scores["completeness"] = 50  # Can't determine

        # --- Maintainability ---
        has_type_hints = any(
            node.returns is not None
            for node in ast.walk(tree)
            if isinstance(node, ast.FunctionDef)
        )
        has_docstrings = any(
            isinstance(node.body[0], ast.Expr) and isinstance(node.body[0].value, ast.Constant)
            for node in ast.walk(tree)
            if isinstance(node, ast.FunctionDef) and node.body
        )
        maint = 50
        if has_type_hints:
            maint += 25
        if has_docstrings:
            maint += 25
        scores["maintainability"] = maint

        # --- Banking compliance ---
        uses_decimal = "Decimal" in python_output
        has_try_except = any(isinstance(n, ast.Try) for n in ast.walk(tree))
        bank = 40
        if uses_decimal:
            bank += 30
        if has_try_except:
            bank += 30
        scores["banking_compliance"] = min(bank, 100)

        # Check for float usage on monetary values
        if "float(" in python_output.lower():
            issues.append({
                "severity": "critical",
                "dimension": "banking_compliance",
                "description": "float() used — may cause precision loss on monetary values",
                "line": None,
                "remediation": "Replace float() with Decimal() for all monetary calculations.",
            })
    else:
        scores["completeness"] = 10
        scores["maintainability"] = 10
        scores["banking_compliance"] = 10

    return {
        "module": module_name,
        "scores": scores,
        "issues": issues,
        "summary": "Fallback scoring (AST-based) — OpenAI API was unreachable. "
                   "Only syntax, coverage, and basic checks performed.",
    }


# ---------------------------------------------------------------------------
# Strands Tool Definition
# ---------------------------------------------------------------------------
@tool
def quality_scorer(
    module_name: str,
    cobol_source: str,
    python_output: str,
    conversion_notes: str = "",
    output_dir: str = "./output",
) -> dict:
    """
    Score a COBOL-to-Python conversion using GPT-5.2-Codex quality assessment.

    Evaluates the conversion on 4 dimensions: Correctness (35%), Completeness (25%),
    Maintainability (20%), and Banking Compliance (20%). Returns a structured score
    with issues and remediation suggestions.

    Uses content-hash caching to avoid re-scoring identical conversions.
    Falls back to AST-based rule checking if OpenAI is unreachable.

    Args:
        module_name: COBOL program ID being scored.
        cobol_source: Original COBOL source code.
        python_output: Converted Python code to evaluate.
        conversion_notes: Conversion instructions/notes from the plan.
        output_dir: Base output directory for cache storage.

    Returns:
        Dict with module, scores (4 dimensions), overall weighted score,
        threshold (green/yellow/red), issues list, and summary.
    """
    cache_dir = Path(output_dir) / "scores_cache"
    cache_key = _cache_key(cobol_source, python_output)

    # Check cache first (FR-3.10)
    cached = _get_cached_score(cache_dir, cache_key)
    if cached:
        logger.info(f"Cache hit for {module_name} (key={cache_key[:8]})")
        cached["cached"] = True
        return cached

    # Try GPT-5.2-Codex (FR-3.1)
    fallback = False
    try:
        result = _score_with_codex(module_name, cobol_source, python_output, conversion_notes)
    except Exception as e:
        logger.warning(f"GPT-5.2-Codex scoring failed for {module_name}: {e}. Using fallback.")
        result = _score_with_fallback(module_name, cobol_source, python_output)
        fallback = True

    # Compute weighted overall and threshold
    overall = _compute_overall(result["scores"])
    threshold = _determine_threshold(overall)

    score_result = {
        "module": result["module"],
        "scores": result["scores"],
        "overall": overall,
        "threshold": threshold,
        "issues": result.get("issues", []),
        "summary": result.get("summary", ""),
        "fallback": fallback,
        "cached": False,
    }

    # Cache the result (FR-3.10)
    _save_cached_score(cache_dir, cache_key, score_result)
    logger.info(
        f"Scored {module_name}: {overall} ({threshold})"
        f"{' [fallback]' if fallback else ''}"
    )

    return score_result
