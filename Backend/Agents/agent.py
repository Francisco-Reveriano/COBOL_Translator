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

Author: Francisco | Truist Technology & AI
"""

import os
import sys
import json
import logging
from pathlib import Path
from datetime import datetime
from typing import Optional

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
from Prompts.system_prompts import MASTER_AGENT_PROMPT

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Model Configuration
# ---------------------------------------------------------------------------
anthropic_model = AnthropicModel(
    client_args={
        "api_key": os.getenv("ANTHROPIC_API_KEY"),
    },
    max_tokens=64000,
    model_id=os.getenv("ADVANCE_LLM_MODEL", "claude-sonnet-4-20250514"),
    params={
        "temperature": 0.0,
    }
)

# ---------------------------------------------------------------------------
# Stream Handler (Claude Code-style live output)
# ---------------------------------------------------------------------------
class AgentStreamHandler:
    """Streams agent reasoning and tool calls to stdout, similar to
    Claude Code's real-time terminal output."""

    def __init__(self):
        self.current_tool = None

    def __call__(self, event: dict):
        if "data" in event:
            print(event["data"], end="", flush=True)

        if "current_tool_use" in event:
            tool = event["current_tool_use"]
            tool_name = tool.get("name", "unknown")
            if tool_name != self.current_tool:
                self.current_tool = tool_name
                print(f"\n{'─'*60}")
                print(f"  ⚙  Tool: {tool_name}")
                print(f"{'─'*60}")

        if "message" in event and event["message"].get("role") == "assistant":
            # Check for stop_reason to know when loop iteration ends
            stop = event["message"].get("stop_reason")
            if stop == "tool_use":
                pass  # loop continues
            elif stop == "end_turn":
                print("\n✅ Agent turn complete.\n")

# ---------------------------------------------------------------------------
# Agent Factory
# ---------------------------------------------------------------------------

agent = Agent(
    model=anthropic_model,
    system_prompt=MASTER_AGENT_PROMPT,
    tools=[
        cobol_scanner,
        conversion_planner,
        cobol_converter,
        plan_tracker,
        validation_checker,
    ],
    # Callback to stream tool activity like Claude Code's live output
    callback_handler=AgentStreamHandler(),
)

# ---------------------------------------------------------------------------
# Main Entrypoint
# ---------------------------------------------------------------------------
def run_conversion(
    cobol_dir: str,
    output_dir: str = "./output",
):
    """
    Master loop: scan → plan → convert → validate → report.

    This mirrors Claude Code's single-threaded agent loop:
    the agent keeps calling tools until the task is complete,
    then returns a final text response.
    """
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)

    # Single prompt drives the full agentic loop
    prompt = f"""
You are starting a COBOL-to-Python migration. Follow these steps exactly:

1. Use `cobol_scanner` to scan all COBOL files in: {cobol_dir}
2. Use `conversion_planner` to create a detailed, structured conversion plan
3. For each item in the plan, use `plan_tracker` to set status to "in_progress",
   then use `cobol_converter` to convert it, then mark it "completed"
4. After all conversions, use `validation_checker` to verify the output
5. Provide a final migration summary report

Begin now by scanning the COBOL source directory.
"""

    logger.info("Starting COBOL-to-Python conversion agent...")
    logger.info(f"   Source: {cobol_dir}")
    logger.info(f"   Output: {output_dir}")

    result = agent(prompt)

    # Save final report
    report_path = output_path / "migration_report.md"
    report_path.write_text(str(result))
    logger.info(f"Migration report saved to {report_path}")

    return result


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="COBOL-to-Python Conversion Agent")
    parser.add_argument("cobol_dir", help="Directory containing COBOL source files")
    parser.add_argument("--output", default="./output", help="Output directory for Python files")
    args = parser.parse_args()

    run_conversion(args.cobol_dir, args.output)
