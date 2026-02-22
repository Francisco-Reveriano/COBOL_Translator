# COBOL-to-Python Conversion Agent

An agentic COBOL-to-Python migration system powered by [Strands Agents](https://github.com/strands-agents/sdk-python) and Claude (Anthropic). The agent autonomously scans COBOL source files, builds a dependency-ordered conversion plan, translates each program to Python, validates the output, and produces a migration report.

Inspired by Claude Code's single-threaded master loop with structured planning (TodoWrite pattern).

## Architecture

The agent executes a 5-phase workflow:

```
Phase 1: SCAN      Analyze COBOL files, extract structure and dependencies
       |
Phase 2: PLAN      Generate a dependency-ordered conversion plan (TodoWrite pattern)
       |
Phase 3: CONVERT   Loop through each plan item, converting COBOL to Python
       |
Phase 4: VALIDATE  Check syntax, structural coverage, and data type mappings
       |
Phase 5: REPORT    Produce a final migration summary
```

### Tools

| Tool | Purpose |
|------|---------|
| `cobol_scanner` | Parses COBOL files to extract divisions, sections, paragraphs, data definitions, COPY/CALL dependencies, embedded SQL/CICS detection, and complexity scoring |
| `conversion_planner` | Generates a structured plan with topological ordering based on the dependency graph. Each item has an ID, status, priority, phase, and detailed conversion notes |
| `cobol_converter` | Reads COBOL source, generates Python scaffolding and conversion context for the LLM to produce a complete Python module |
| `plan_tracker` | Manages plan state (view, update status, check dependencies, get next item, show progress). Acts as the agent's memory during long conversions |
| `validation_checker` | Post-conversion validation: Python syntax (AST parsing), structural coverage, data type mapping checks, and pytest test stub generation |

### Conversion Rules

| COBOL | Python |
|-------|--------|
| `PIC X(n)` | `str` |
| `PIC 9(n)` | `int` |
| `PIC 9(n)V9(m)` | `Decimal` |
| `PIC S9 COMP-3` | `Decimal` |
| Group levels (01-49) | `@dataclass` |
| `PERFORM paragraph` | Function call |
| `PERFORM UNTIL` | `while` loop |
| `PERFORM VARYING` | `for` loop |
| `EVALUATE / WHEN` | `match / case` (Python 3.10+) |
| Sequential file I/O | `csv` / `open()` |
| Indexed file I/O | `sqlite3` |
| `EXEC SQL` | SQLAlchemy / parameterized queries |
| `CALL` dependencies | Function imports |

## Project Structure

```
Code_Translation/
├── Backend/
│   └── Agents/
│       ├── agent.py                  # Main entry point
│       ├── Prompts/
│       │   └── system_prompts.py     # Agent system prompt and refinement prompt
│       └── Tools/
│           ├── cobol_scanner.py      # COBOL file analysis
│           ├── conversion_planner.py # Plan generation (TodoWrite pattern)
│           ├── cobol_converter.py    # COBOL-to-Python scaffolding
│           ├── plan_tracker.py       # Plan state management
│           └── validation_checker.py # Output validation and test stubs
├── Data/
│   ├── ACCT-PROC.cbl                # Sample: account processing with interest calc
│   └── Raw/
│       ├── CBL0106.cbl              # Sample: financial report program
│       └── CBL0106C.cbl             # Sample: improved version with overflow protection
├── .env                              # API keys (not committed to version control)
├── requirements.txt                  # Python dependencies
└── README.md
```

## Prerequisites

- Python 3.10+
- An [Anthropic API key](https://console.anthropic.com/)

## Setup

### 1. Clone and enter the project

```bash
cd Code_Translation
```

### 2. Create a virtual environment

```bash
python -m venv .venv
source .venv/bin/activate  # macOS/Linux
# .venv\Scripts\activate   # Windows
```

### 3. Install dependencies

```bash
pip install -r requirements.txt
```

### 4. Configure your API key

Create a `.env` file in the project root:

```bash
ANTHROPIC_API_KEY="sk-ant-api03-your-key-here"
```

Optionally override the default model:

```bash
ADVANCE_LLM_MODEL="claude-sonnet-4-20250514"
```

## Usage

### Basic usage

Convert the included sample COBOL files:

```bash
python Backend/Agents/agent.py ./Data
```

### Specify a custom output directory

```bash
python Backend/Agents/agent.py ./Data --output ./my_output
```

### Convert your own COBOL files

Point the agent at any directory containing `.cbl`, `.cob`, or `.cpy` files:

```bash
python Backend/Agents/agent.py /path/to/your/cobol/sources --output ./converted
```

### Example session

```
$ python Backend/Agents/agent.py ./Data

2025-06-15 10:32:01 [INFO] Starting COBOL-to-Python conversion agent...
2025-06-15 10:32:01 [INFO]    Source: ./Data
2025-06-15 10:32:01 [INFO]    Output: ./output

────────────────────────────────────────────────────────
  ⚙  Tool: cobol_scanner
────────────────────────────────────────────────────────
Scanning 3 COBOL files...

────────────────────────────────────────────────────────
  ⚙  Tool: conversion_planner
────────────────────────────────────────────────────────
Generating conversion plan with 3 programs...

────────────────────────────────────────────────────────
  ⚙  Tool: plan_tracker
────────────────────────────────────────────────────────
Plan created: 5 items across 4 phases

────────────────────────────────────────────────────────
  ⚙  Tool: cobol_converter
────────────────────────────────────────────────────────
Converting ACCT-PROC (141 lines)...

...

✅ Agent turn complete.

2025-06-15 10:35:47 [INFO] Migration report saved to output/migration_report.md
```

### Output structure

After a successful run, the output directory contains:

```
output/
├── conversion_plan.json        # Full conversion plan with statuses
├── migration_report.md         # Final migration summary
├── programs/
│   ├── acct_proc.py            # Converted Python modules
│   ├── cbl0106.py
│   └── cbl0106c.py
├── shared/                     # Shared copybook conversions (if any)
├── tests/
│   ├── test_acct_proc.py       # Auto-generated pytest stubs
│   ├── test_cbl0106.py
│   └── test_cbl0106c.py
└── main.py                     # Integration entry point
```

## Sample COBOL Files

The `Data/` directory includes three sample programs for testing:

| File | Description | Features |
|------|-------------|----------|
| `ACCT-PROC.cbl` | Account processing with interest calculation | `EVALUATE/WHEN`, sequential file I/O, `COMP-3` packed decimal |
| `CBL0106.cbl` | Financial report generator | Virginia client tracking, over-limit detection, formatted report output |
| `CBL0106C.cbl` | Improved financial report | Same as CBL0106 with bounds checking and overflow protection |

## Configuration

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `ANTHROPIC_API_KEY` | *(required)* | Your Anthropic API key |
| `ADVANCE_LLM_MODEL` | `claude-sonnet-4-20250514` | Claude model ID to use |

## Author

Francisco | Truist Technology & AI
