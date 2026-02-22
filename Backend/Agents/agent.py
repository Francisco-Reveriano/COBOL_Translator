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
from Tools.cobol_converter import cobol_converter
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

    def __call__(self, event: dict) -> None:
        if "data" in event:
            print(event["data"], end="", flush=True)

        if "current_tool_use" in event:
            tool = event["current_tool_use"]
            tool_name = tool.get("name", "unknown")
            if tool_name != self.current_tool:
                self.current_tool = tool_name
                print(f"\n{'─'*60}")
                print(f"  Tool: {tool_name}")
                print(f"{'─'*60}")

        if "message" in event and event["message"].get("role") == "assistant":
            stop = event["message"].get("stop_reason")
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

    def __call__(self, event: dict) -> None:
        # Reasoning text chunks
        if "data" in event:
            self._reasoning_counter += 1
            self.event_callback("reasoning", {
                "id": self._reasoning_counter,
                "text": event["data"],
                "phase": self._current_phase,
            })

        # Tool call start
        if "current_tool_use" in event:
            tool = event["current_tool_use"]
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
                    })

                self.current_tool = tool_name
                self.tool_start_time = time.time()
                self._update_phase(tool_name)

                self.event_callback("tool_call", {
                    "id": tool.get("toolUseId", tool_name),
                    "tool": tool_name,
                    "input": tool.get("input", {}),
                })

        # Turn complete
        if "message" in event and event["message"].get("role") == "assistant":
            stop = event["message"].get("stop_reason")
            if stop == "end_turn":
                # Emit final tool_result if a tool was running
                if self.current_tool and self.tool_start_time:
                    duration_ms = int((time.time() - self.tool_start_time) * 1000)
                    self.event_callback("tool_result", {
                        "id": self.current_tool,
                        "tool": self.current_tool,
                        "output": {},
                        "duration_ms": duration_ms,
                    })
                    self.current_tool = None

    def _update_phase(self, tool_name: str) -> None:
        """Infer the current phase from the tool being called."""
        phase_map = {
            "cobol_scanner": "scan",
            "conversion_planner": "plan",
            "cobol_converter": "convert",
            "plan_tracker": self._current_phase,  # stays in current
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
) -> Agent:
    """
    Create a configured Strands Agent.

    Args:
        event_callback: If provided, use SSE streaming mode (API).
                        If None, use CLI mode (stdout).
        api_key: Override Anthropic API key.
        model_id: Override model ID.

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
        system_prompt=MASTER_AGENT_PROMPT,
        tools=[
            cobol_scanner,
            conversion_planner,
            cobol_converter,
            plan_tracker,
            validation_checker,
            quality_scorer,
        ],
        callback_handler=handler,
    )


# ---------------------------------------------------------------------------
# Conversion Runner
# ---------------------------------------------------------------------------
def build_conversion_prompt(cobol_dir: str) -> str:
    """Build the master prompt that drives the full agentic loop."""
    return f"""
You are starting a COBOL-to-Python migration. Follow these steps exactly:

1. Use `cobol_scanner` to scan all COBOL files in: {cobol_dir}
2. Use `conversion_planner` to create a detailed, structured conversion plan
3. For each item in the plan:
   a. Use `plan_tracker` to set status to "in_progress"
   b. Use `cobol_converter` to convert it
   c. Use `quality_scorer` to score the conversion (pass the COBOL source and Python output)
   d. Mark the item "completed" with `plan_tracker`
4. After all conversions, use `validation_checker` to verify the output
5. Provide a final migration summary report including all quality scores

Begin now by scanning the COBOL source directory.
"""


def run_conversion(
    cobol_dir: str,
    output_dir: str = "./output",
    event_callback: Optional[EventCallback] = None,
    steering_checker: Optional[Callable[[], dict]] = None,
) -> str:
    """
    Master loop: scan → plan → convert → validate → report.

    Args:
        cobol_dir: Directory containing COBOL source files.
        output_dir: Directory for conversion output.
        event_callback: Optional SSE event callback for API mode.
        steering_checker: Optional callable returning steering state dict with
                          keys: pause_requested, skip_requested, retry_item_id.
                          Called between agent invocations for steering control.

    Returns:
        The agent's final response as a string.
    """
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)

    agent = create_agent(event_callback=event_callback)
    prompt = build_conversion_prompt(cobol_dir)

    logger.info("Starting COBOL-to-Python conversion agent...")
    logger.info(f"   Source: {cobol_dir}")
    logger.info(f"   Output: {output_dir}")

    result = agent(prompt)
    result_text = str(result)

    # Save final report
    report_path = output_path / "migration_report.md"
    report_path.write_text(result_text)
    logger.info(f"Migration report saved to {report_path}")

    return result_text


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
