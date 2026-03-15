"""
COBOL-to-Python Conversion Agent (AWS Strands)
================================================
An agentic COBOL-to-Python migration system inspired by Claude Code's
single-threaded master loop with structured planning (TodoWrite pattern).

Architecture:
  1. SCAN   → Ingest all COBOL files, build dependency graph
  2. PLAN   → Generate structured conversion plan (TodoWrite-style)
  3. CONVERT → Execute plan step-by-step, converting each module
  4. VALIDATE → Cross-reference outputs, run checks
  5. REPORT  → Produce final migration report

Supports two modes:
  - CLI: `python agent.py <cobol_dir>` (prints to stdout)
  - API: create_agent(event_callback) for FastAPI SSE streaming

Author: Francisco | Truist Technology & AI
"""

import os
import sys
import json
import logging
import time
from pathlib import Path
from datetime import datetime
from typing import Any, Callable, Optional

from dotenv import load_dotenv

load_dotenv()

sys.path.insert(0, str(Path(__file__).resolve().parent))

from strands import Agent
from strands.models.anthropic import AnthropicModel

from Tools.cobol_scanner import cobol_scanner
from Tools.conversion_planner import conversion_planner
from Tools.cobol_converter import cobol_converter, cobol_refiner
from Tools.plan_tracker import plan_tracker
from Tools.validation_checker import validation_checker
from Tools.quality_scorer import quality_scorer
from Prompts.system_prompts import MASTER_AGENT_PROMPT

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)


# Type alias for event callbacks
EventCallback = Callable[[str, dict[str, Any]], None]


# ---------------------------------------------------------------------------
# Model Factory
# ---------------------------------------------------------------------------
def create_model(
    api_key: Optional[str] = None,
    model_id: Optional[str] = None,
) -> AnthropicModel:
    """Create an AnthropicModel with the given or default configuration."""
    return AnthropicModel(
        client_args={
            "api_key": api_key or os.getenv("ANTHROPIC_API_KEY"),
        },
        max_tokens=64000,
        model_id=model_id or os.getenv("ADVANCE_LLM_MODEL", "claude-sonnet-4-20250514"),
        params={
            "temperature": 0.0,
        },
    )


# ---------------------------------------------------------------------------
# Stream Handlers
# ---------------------------------------------------------------------------
class CLIStreamHandler:
    """Streams agent activity to stdout for CLI mode."""

    def __init__(self) -> None:
        self.current_tool: Optional[str] = None

    def __call__(self, **kwargs: Any) -> None:
        if "init_event_loop" in kwargs or "result" in kwargs:
            return

        if "data" in kwargs:
            print(kwargs["data"], end="", flush=True)

        if "current_tool_use" in kwargs:
            tool = kwargs["current_tool_use"]
            tool_name = tool.get("name", "unknown")
            if tool_name != self.current_tool:
                self.current_tool = tool_name
                print(f"\n{'─'*60}")
                print(f"  Tool: {tool_name}")
                print(f"{'─'*60}")

        if "message" in kwargs and kwargs["message"].get("role") == "assistant":
            stop = kwargs["message"].get("stop_reason")
            if stop == "end_turn":
                print("\nAgent turn complete.\n")


class SSEStreamHandler:
    """Streams agent activity to the SSE event bus for API mode."""

    def __init__(self, event_callback: EventCallback) -> None:
        self.event_callback = event_callback
        self.current_tool: Optional[str] = None
        self.tool_start_time: float = 0.0
        self._reasoning_counter = 0
        self._current_phase = "scan"

    def __call__(self, **kwargs: Any) -> None:
        if "init_event_loop" in kwargs or "result" in kwargs:
            return

        # Reasoning text chunks
        if "data" in kwargs:
            self._reasoning_counter += 1
            self.event_callback("reasoning", {
                "id": self._reasoning_counter,
                "text": kwargs["data"],
                "phase": self._current_phase,
            })

        # Tool call start
        if "current_tool_use" in kwargs:
            tool = kwargs["current_tool_use"]
            tool_name = tool.get("name", "unknown")
            if tool_name != self.current_tool:
                # Emit tool_result for previous tool if applicable
                if self.current_tool and self.tool_start_time:
                    duration_ms = int((time.time() - self.tool_start_time) * 1000)
                    self.event_callback("tool_result", {
                        "id": self.current_tool,
                        "tool": self.current_tool,
                        "output": {},
                        "duration_ms": duration_ms,
                        "phase": self._current_phase,
                    })

                self.current_tool = tool_name
                self.tool_start_time = time.time()
                self._update_phase(tool_name)

                self.event_callback("tool_call", {
                    "id": tool.get("toolUseId", tool_name),
                    "tool": tool_name,
                    "input": tool.get("input", {}),
                    "phase": self._current_phase,
                })

        # Turn complete
        if "message" in kwargs and kwargs["message"].get("role") == "assistant":
            stop = kwargs["message"].get("stop_reason")
            if stop == "end_turn":
                # Emit final tool_result if a tool was running
                if self.current_tool and self.tool_start_time:
                    duration_ms = int((time.time() - self.tool_start_time) * 1000)
                    self.event_callback("tool_result", {
                        "id": self.current_tool,
                        "tool": self.current_tool,
                        "output": {},
                        "duration_ms": duration_ms,
                        "phase": self._current_phase,
                    })
                    self.current_tool = None

    def _update_phase(self, tool_name: str) -> None:
        """Infer the current phase from the tool being called."""
        phase_map = {
            "cobol_scanner": "analyze",
            "conversion_planner": "plan",
            "cobol_converter": "convert",
            "cobol_refiner": "convert",
            "plan_tracker": self._current_phase,
            "validation_checker": "validate",
            "quality_scorer": "score",
        }
        self._current_phase = phase_map.get(tool_name, self._current_phase)


# ---------------------------------------------------------------------------
# Agent Factory
# ---------------------------------------------------------------------------
def create_agent(
    event_callback: Optional[EventCallback] = None,
    api_key: Optional[str] = None,
    model_id: Optional[str] = None,
    output_dir: str = "./output",
) -> Agent:
    """
    Create a configured Strands Agent.

    Args:
        event_callback: If provided, use SSE streaming mode (API).
                        If None, use CLI mode (stdout).
        api_key: Override Anthropic API key.
        model_id: Override model ID.
        output_dir: Base output directory injected into the system prompt.

    Returns:
        Configured Agent instance.
    """
    model = create_model(api_key=api_key, model_id=model_id)

    if event_callback:
        handler = SSEStreamHandler(event_callback)
    else:
        handler = CLIStreamHandler()

    return Agent(
        model=model,
        system_prompt=MASTER_AGENT_PROMPT.format(output_dir=output_dir),
        tools=[
            cobol_scanner,
            conversion_planner,
            cobol_converter,
            cobol_refiner,
            plan_tracker,
            validation_checker,
            quality_scorer,
        ],
        callback_handler=handler,
    )


# ---------------------------------------------------------------------------
# Conversion Runner
# ---------------------------------------------------------------------------
def build_conversion_prompt(cobol_dir: str, output_dir: str = "./output") -> str:
    """Build the master prompt that drives the full agentic loop."""
    return f"""
You are starting a COBOL-to-Python migration. Follow these steps exactly:

1. Use `cobol_scanner(directory="{cobol_dir}", output_dir="{output_dir}")` to scan all COBOL files
2. Use `conversion_planner(output_dir="{output_dir}")` to create a structured conversion plan
3. For each item in the plan:
   a. Use `plan_tracker(action="next", output_dir="{output_dir}")` to get the next item
   b. Use `plan_tracker(action="update_status", ..., new_status="in_progress", output_dir="{output_dir}")`
   c. Use `cobol_converter(source_file=..., target_file=..., program_id=..., item_id=..., output_dir="{output_dir}")` to load source and conversion context
   d. Generate the full Python module based on the COBOL source and conversion notes
   e. Use `quality_scorer(module_name=..., cobol_source=..., python_output=<your Python code>, output_dir="{output_dir}", target_file=<target_file>)` to write the code to disk and score it
   f. REFINEMENT LOOP — target score >= 95.0, max 3 attempts:
      If the overall score is below 95.0 and you have fewer than 3 refinement attempts:
        i.   Use `cobol_refiner(source_file=..., target_file=..., program_id=..., attempt=<1,2,3>, output_dir="{output_dir}")` — it reads the score from disk
        ii.  Generate an improved Python module addressing every issue
        iii. Use `quality_scorer(module_name=..., cobol_source=..., python_output=<improved code>, output_dir="{output_dir}", target_file=<target_file>)` to write improved code to disk and re-score
        iv.  Repeat until score >= 95.0 or 3 attempts exhausted
   g. Mark the item "completed" with `plan_tracker(action="update_status", ..., new_status="completed", output_dir="{output_dir}")`
4. After all conversions, use `validation_checker(output_dir="{output_dir}")` to verify the output
5. Provide a final migration summary report including all quality scores

Begin now by scanning the COBOL source directory.
"""


def build_conversion_prompt_skip_scan(cobol_dir: str, output_dir: str = "./output") -> str:
    """Build prompt that skips scanning (scan_results.json already exists from /analyze)."""
    return f"""
You are continuing a COBOL-to-Python migration. The COBOL source files have already been
scanned and the results are saved at `{output_dir}/scan_results.json`.

DO NOT call cobol_scanner — the scan is already complete.

Follow these steps exactly:

1. Use `conversion_planner(output_dir="{output_dir}")` to create a structured conversion plan
   (it will read scan_results.json automatically)
2. For each item in the plan:
   a. Use `plan_tracker(action="next", output_dir="{output_dir}")` to get the next item
   b. Use `plan_tracker(action="update_status", ..., new_status="in_progress", output_dir="{output_dir}")`
   c. Use `cobol_converter(source_file=..., target_file=..., program_id=..., item_id=..., output_dir="{output_dir}")` to load source and conversion context
   d. Generate the full Python module based on the COBOL source and conversion notes
   e. Use `quality_scorer(module_name=..., cobol_source=..., python_output=<your Python code>, output_dir="{output_dir}", target_file=<target_file>)` to write the code to disk and score it
   f. REFINEMENT LOOP — target score >= 95.0, max 3 attempts:
      If the overall score is below 95.0 and you have fewer than 3 refinement attempts:
        i.   Use `cobol_refiner(source_file=..., target_file=..., program_id=..., attempt=<1,2,3>, output_dir="{output_dir}")` — it reads the score from disk
        ii.  Generate an improved Python module addressing every issue
        iii. Use `quality_scorer(module_name=..., cobol_source=..., python_output=<improved code>, output_dir="{output_dir}", target_file=<target_file>)` to write improved code to disk and re-score
        iv.  Repeat until score >= 95.0 or 3 attempts exhausted
   g. Mark the item "completed" with `plan_tracker(action="update_status", ..., new_status="completed", output_dir="{output_dir}")`
3. After all conversions, use `validation_checker(output_dir="{output_dir}")` to verify the output
4. Provide a final migration summary report including all quality scores

Begin now by creating the conversion plan.
"""


def run_conversion(
    cobol_dir: str,
    output_dir: str = "./output",
    event_callback: Optional[EventCallback] = None,
    steering_checker: Optional[Callable[[], dict]] = None,
    skip_scan: bool = False,
) -> dict:
    """
    Master loop: scan → plan → convert → validate → report.

    Args:
        cobol_dir: Directory containing COBOL source files.
        output_dir: Directory for conversion output.
        event_callback: Optional SSE event callback for API mode.
        steering_checker: Optional callable returning steering state dict with
                          keys: pause_requested, skip_requested, retry_item_id.
                          Called between agent invocations for steering control.
        skip_scan: If True, skip scanning (scan_results.json already exists).

    Returns:
        The agent's final response as a string.
    """
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)

    # Wire SSE event callbacks into tool modules so they emit live updates
    if event_callback:
        from Tools.plan_tracker import set_event_callback as set_plan_cb
        from Tools.quality_scorer import set_event_callback as set_score_cb
        from Tools.conversion_planner import set_event_callback as set_planner_cb
        set_plan_cb(event_callback)
        set_score_cb(event_callback)
        set_planner_cb(event_callback)

    agent = create_agent(event_callback=event_callback, output_dir=output_dir)

    if skip_scan:
        prompt = build_conversion_prompt_skip_scan(cobol_dir, output_dir)
    else:
        prompt = build_conversion_prompt(cobol_dir, output_dir)

    logger.info("Starting COBOL-to-Python conversion agent...")
    logger.info(f"   Source: {cobol_dir}")
    logger.info(f"   Output: {output_dir}")

    result = agent(prompt)
    result_text = str(result)

    # Extract token usage from Strands AgentResult
    token_usage = None
    try:
        if hasattr(result, 'metrics') and hasattr(result.metrics, 'accumulated_usage'):
            token_usage = dict(result.metrics.accumulated_usage)
    except Exception as exc:
        logger.warning(f"Failed to extract token metrics: {exc}")

    # Save final report
    report_path = output_path / "migration_report.md"
    report_path.write_text(result_text)
    logger.info(f"Migration report saved to {report_path}")

    return {"text": result_text, "token_usage": token_usage}


# ---------------------------------------------------------------------------
# CLI Entrypoint
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="COBOL-to-Python Conversion Agent")
    parser.add_argument("cobol_dir", help="Directory containing COBOL source files")
    parser.add_argument("--output", default="./output", help="Output directory for Python files")
    args = parser.parse_args()

    run_conversion(args.cobol_dir, args.output)
