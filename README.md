# COBOL-to-Python Migration Platform

A full-stack agentic COBOL-to-Python migration system powered by [Strands Agents](https://github.com/strands-agents/sdk-python), Claude (Anthropic), and GPT-5.2-Codex (OpenAI) for quality scoring. Features a FastAPI backend with SSE streaming, a React UI with real-time visualization, interactive dependency graphs, WebSocket steering, and crash recovery.

## Architecture

```
┌─────────────┐     SSE      ┌───────────────────────────────────────────────┐
│   React UI  │◄────────────►│  FastAPI Backend (localhost:8000)             │
│  (Vite dev) │   WebSocket  │                                               │
│  :5173      │──────────────│  ┌─────────────────────────────────────────┐  │
└─────────────┘              │  │  Strands Agent (Claude)                 │  │
                             │  │                                         │  │
                             │  │  ┌──────┐ ┌──────┐ ┌─────────────────┐ │  │
                             │  │  │Scan  │→│Plan  │→│Convert → Refine │ │  │
                             │  │  └──────┘ └──────┘ └────────┬────────┘ │  │
                             │  │                             ↓          │  │
                             │  │  ┌──────────┐ ┌────────┐ ┌──────┐     │  │
                             │  │  │Validate  │→│Report  │ │Score │     │  │
                             │  │  └──────────┘ └────────┘ └──────┘     │  │
                             │  └─────────────────────────────────────────┘  │
                             │  GPT-5.2-Codex ◄── Quality Scoring           │
                             └───────────────────────────────────────────────┘
```

### 7-Tool Pipeline

| Phase | Tool | Description |
|-------|------|-------------|
| 1. Scan | `cobol_scanner` | Analyze COBOL files, extract structure and dependencies |
| 2. Plan | `conversion_planner` | Generate dependency-ordered conversion plan (TodoWrite pattern) |
| 3. Track | `plan_tracker` | Manage plan state: view, update status, check deps, next item |
| 4. Convert | `cobol_converter` | Loop through plan items, converting COBOL to Python |
| 5. Refine | `cobol_refiner` | Iterative quality improvement loop on converted output |
| 6. Score | `quality_scorer` | GPT-5.2-Codex evaluates each module on 4 dimensions |
| 7. Validate | `validation_checker` | Syntax, structural coverage, data type mapping, test stubs |

### Quality Scoring Rubric

| Dimension | Weight | Description |
|-----------|--------|-------------|
| Correctness | 35% | Logic faithfulness, data type mapping, control flow |
| Completeness | 25% | All paragraphs/sections converted, no TODOs left |
| Maintainability | 20% | Type hints, docstrings, naming conventions |
| Banking Compliance | 20% | Decimal precision, error handling, audit readiness |

Thresholds: Green >= 85, Yellow 70-84, Red < 70

### Agent Communication Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Strands Agent (thread pool)                                            │
│                                                                         │
│  tool fn() ──► return strands_result({...})                             │
│                  │                                                       │
│                  ▼  {"status":"success","content":[{"text":"..."}]}      │
│             SSEStreamHandler callback                                    │
│                  │                                                       │
│                  ▼                                                       │
│             emit() closure (api.py)                                      │
│                  ├──► event_bus.emit()       ← thread-safe, wakes loop  │
│                  │         │                                             │
│                  │         ▼                                             │
│                  │    EventBus.stream()      ← async generator          │
│                  │         │                                             │
│                  │         ▼                                             │
│                  │    SSE to browser         ← GET /api/v1/convert/stream│
│                  │         │                                             │
│                  │         ▼                                             │
│                  │    useSSE.ts → conversionStore reducer → React render │
│                  │                                                       │
│                  └──► audit_log.log_event()  ← try/except, non-fatal    │
│                            │                                             │
│                            ▼                                             │
│                       JSONL file (session log)                           │
└─────────────────────────────────────────────────────────────────────────┘
```

### Resilience Architecture

Three safety layers prevent tool-return serialization crashes from killing a conversion mid-flight:

| Layer | Location | Protection |
|-------|----------|------------|
| **Layer 1 — `strands_result()` envelope** | `tool_helpers.py` → every `@tool` return | Wraps all tool return dicts in `{"status", "content": [{"text": json.dumps(...)}]}` so the Strands SDK never falls back to `str()` serialization |
| **Layer 2 — Defensive `audit_log`** | `audit_log.py` → `_truncate_dict()` | Accepts `Any` (not just `dict`), handles stringified JSON and non-dict payloads gracefully before writing to the JSONL audit trail |
| **Layer 3 — `try/except` in `emit()`** | `api.py` → `emit()` closure | Catches any exception from `audit_log.log_event()` so a logging failure never propagates back to the Strands agent thread |

## Project Structure

```
Code_Translation/
├── Backend/
│   ├── api.py                    # FastAPI application (SSE, WebSocket, REST)
│   ├── config.py                 # Pydantic Settings (.env validation)
│   ├── schemas.py                # Pydantic v2 request/response models
│   ├── event_bus.py              # SSE event buffer with replay
│   ├── session.py                # Session state + checkpoint persistence
│   ├── audit_log.py              # JSONL audit trail
│   └── Agents/
│       ├── agent.py              # Strands agent (CLI + API dual-mode)
│       ├── Prompts/
│       │   └── system_prompts.py # Agent system prompt
│       └── Tools/
│           ├── tool_helpers.py       # strands_result() envelope helper
│           ├── cobol_scanner.py      # COBOL file analysis
│           ├── conversion_planner.py # Plan generation
│           ├── cobol_converter.py    # COBOL→Python + cobol_refiner loop
│           ├── plan_tracker.py       # Plan state management (TodoWrite)
│           ├── validation_checker.py # Output validation + test stubs
│           └── quality_scorer.py     # GPT-5.2-Codex integration
├── Frontend/
│   ├── src/
│   │   ├── App.tsx               # Main layout with split panes
│   │   ├── components/           # 13 React components
│   │   ├── hooks/                # useSSE, useWebSocket, useTheme
│   │   ├── stores/               # Central reducer store
│   │   └── types/                # TypeScript event types
│   ├── package.json
│   └── vite.config.ts
├── Data/                         # Sample COBOL files
├── .env                          # API keys
├── requirements.txt              # Python dependencies
└── .cobol2py/                    # Recovery checkpoint
```

## Prerequisites

- Python 3.10+
- Node.js 18+
- [Anthropic API key](https://console.anthropic.com/)
- [OpenAI API key](https://platform.openai.com/) (for quality scoring)

## Setup

### 1. Python backend

```bash
cd Code_Translation
python -m venv .venv
source .venv/bin/activate   # macOS/Linux
pip install -r requirements.txt
```

### 2. React frontend

```bash
cd Frontend
npm install
```

### 3. Configure API keys

Create a `.env` file in the project root:

```bash
ANTHROPIC_API_KEY="sk-ant-api03-your-key-here"
OPENAI_API_KEY="sk-your-openai-key-here"
```

Optional overrides:

```bash
ADVANCE_LLM_MODEL="claude-sonnet-4-20250514"  # Default model
OUTPUT_DIR="./output"                           # Conversion output
INPUT_DIR="./input"                             # Uploaded COBOL files
```

## Running

### Full-Stack Mode (recommended)

Terminal 1 — Backend:
```bash
cd Code_Translation
source .venv/bin/activate
uvicorn Backend.api:app --host 0.0.0.0 --port 8000
```

Terminal 2 — Frontend:
```bash
cd Code_Translation/Frontend
npm run dev
```

Open http://localhost:5173 in your browser.

### CLI Mode (no UI)

```bash
python Backend/Agents/agent.py ./Data --output ./output
```

## Usage

### Web UI Workflow

1. **Upload** — Drag-and-drop `.cbl/.cob/.cpy` files or use the file picker
2. **Convert** — Click "Start Conversion" to begin the 7-tool pipeline
3. **Monitor** — Watch the streaming activity panel, step timeline, and dependency graph
4. **Steer** — Use Pause/Resume/Skip/Retry buttons during conversion
5. **Review** — Browse converted files in the Monaco editor, compare in Diff View
6. **Download** — Get a ZIP archive of all converted files

### Steering Commands (WebSocket)

| Command | Effect |
|---------|--------|
| PAUSE | Suspends agent after current tool completes |
| RESUME | Continues from where it paused |
| SKIP | Marks current module as skipped, advances to next |
| RETRY | Re-runs conversion on the current or specified module |

### Crash Recovery

If the server is killed mid-conversion:
- State is persisted to `.cobol2py/state.json`
- On next startup, the UI will prompt "Resume previous conversion?"
- Choosing Resume continues from the last completed plan item
- Choosing Start Fresh discards the checkpoint

### Audit Trail

All events are logged to `./output/logs/session_{id}_{timestamp}.jsonl`:
- Tool calls and results
- Quality scores
- Errors and retries
- Reasoning excerpts

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/upload` | Upload COBOL source files |
| POST | `/api/v1/convert` | Start conversion |
| GET | `/api/v1/convert/stream` | SSE event stream |
| GET | `/api/v1/convert/status` | Current session status |
| GET | `/api/v1/convert/plan` | Full conversion plan |
| GET | `/api/v1/convert/scores` | Quality scores |
| GET | `/api/v1/convert/graph` | React Flow dependency graph |
| GET | `/api/v1/convert/resume` | Check for resumable conversion |
| POST | `/api/v1/convert/resume` | Resume interrupted conversion |
| DELETE | `/api/v1/convert/resume` | Discard checkpoint |
| GET | `/api/v1/files` | List COBOL and Python files |
| GET | `/api/v1/files/content` | Serve file content |
| GET | `/api/v1/download` | ZIP archive of output |
| GET | `/api/v1/config` | Current configuration |
| WS | `/api/v1/ws` | WebSocket steering |

## Conversion Rules

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
| `EVALUATE / WHEN` | `match / case` |
| Sequential file I/O | `csv` / `open()` |
| Indexed file I/O | `sqlite3` |
| `EXEC SQL` | SQLAlchemy / parameterized queries |
| `EXEC CICS` | REST API / microservice calls |

## Sample COBOL Files

| File | Description | Features |
|------|-------------|----------|
| `ACCT-PROC.cbl` | Account processing | `EVALUATE/WHEN`, file I/O, `COMP-3` |
| `CBL0106.cbl` | Financial report | Client tracking, over-limit detection |
| `CBL0106C.cbl` | Improved financial report | Bounds checking, overflow protection |

## Author

Francisco | Truist Technology & AI
