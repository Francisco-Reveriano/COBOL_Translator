# Product Requirements Document
## COBOL-to-Python Agentic Migration Platform

**Streaming React UI | FastAPI Backend | GPT-5.2-Codex Scoring**

| Field | Value |
|---|---|
| **Version** | 2.1 |
| **Date** | February 21, 2026 |
| **Author** | Francisco |
| **Status** | Design Complete |
| **Classification** | Open |

> **Platform:** AWS Strands SDK · Amazon Bedrock · GPT-5.2-Codex · Local-First Architecture

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Product Overview](#2-product-overview)
3. [Design Decisions Log](#3-design-decisions-log)
4. [System Architecture](#4-system-architecture)
5. [Functional Requirements](#5-functional-requirements)
   - 5.1 FR-1: Dynamic Streaming React UI
   - 5.2 FR-2: FastAPI Streaming Backend
   - 5.3 FR-3: LLM Quality Checker (GPT-5.2-Codex)
   - 5.4 FR-4: Dark / Light Theme System
   - 5.5 FR-5: Step Highlighting and Streaming Visualization
   - 5.6 FR-6: Code Map and Flowchart Display
   - 5.7 FR-7: WebSocket Steering Controls
   - 5.8 FR-8: Crash Recovery and State Persistence
6. [API Specification](#6-api-specification)
7. [Non-Functional Requirements](#7-non-functional-requirements)
8. [Technology Stack](#8-technology-stack)
9. [User Stories](#9-user-stories)
10. [Release Plan and Milestones](#10-release-plan-and-milestones)
11. [Risks and Mitigations](#11-risks-and-mitigations)
12. [Appendix](#12-appendix)

---

## 1. Executive Summary

This Product Requirements Document defines the specifications for the **COBOL-to-Python Agentic Migration Platform**, a local-first modernization tool that combines real-time streaming user interfaces, agentic AI orchestration, and automated code quality validation to transform legacy COBOL applications into modern Python services.

The platform runs entirely on the user's local machine via `pip install`, connecting to cloud AI services (Amazon Bedrock for conversion, OpenAI GPT-5.2-Codex for quality scoring) while keeping all source code and artifacts on local disk. The architecture follows Claude Code's single-threaded master loop pattern with TodoWrite-style structured planning.

A key differentiator is the **dual-model quality assurance** approach: Amazon Bedrock (Claude Sonnet/Opus) performs the conversion, while OpenAI GPT-5.2-Codex (`gpt-5.2-codex`, 400K context window, $1.75/$14 per 1M tokens) acts as an independent quality checker that scores each conversion sequentially before the agent proceeds to the next module.

> **Key Objectives**
>
> 1. Automate COBOL-to-Python migration with agentic AI (scan → plan → convert → score → validate)
> 2. Provide real-time visibility into every conversion step via streaming React UI with React Flow dependency graphs
> 3. Integrate GPT-5.2-Codex as a sequential quality checker with 4-dimension scoring rubric
> 4. Support professional dark/light themes (web UI only, desktop viewport 1280px+)
> 5. Display interactive code dependency maps with live node-level status updates
> 6. Enable mid-conversion user steering via WebSocket (Pause, Resume, Skip, Retry)
> 7. Persist plan state and partial conversions to disk for crash recovery

---

## 2. Product Overview

### 2.1 Problem Statement

Organizations maintaining legacy COBOL codebases need a way to migrate to Python that provides real-time visibility into the conversion process, independent quality scoring, and the agentic intelligence to handle complex logic including embedded SQL, CICS transactions, and packed-decimal arithmetic. Existing tools operate as black boxes with no streaming feedback, no independent quality validation, and no ability to steer the process mid-flight.

### 2.2 Solution Overview

A local-first application (installed via `pip install`, runs on `localhost`) that implements a Claude Code-inspired agentic architecture: a single-threaded master loop with TodoWrite-style structured planning, tool-driven execution, and context reminder injection. The agent scans COBOL codebases, generates dependency-aware conversion plans, executes step-by-step migrations with sequential GPT-5.2-Codex quality scoring, and validates output through automated checks — all streamed to a React UI in real-time.

### 2.3 Deployment Model

This is a **single-user, local-first application**. It runs entirely on the user's machine with no server infrastructure, no authentication, and no cloud deployment. The only external network calls are to Amazon Bedrock (for code conversion) and OpenAI API (for quality scoring). All source code, converted outputs, plan state, and audit logs remain on local disk.

| Aspect | Decision |
|---|---|
| **Deployment** | Local machine, single user |
| **Installation** | `pip install` + `.env` file with API keys |
| **Authentication** | None — localhost only |
| **File storage** | Local filesystem |
| **Session management** | In-memory (single user, single session) |
| **Cloud services** | Amazon Bedrock (conversion) + OpenAI API (scoring) only |

### 2.4 Target Users

| User Role | Responsibilities | Key Needs |
|---|---|---|
| **Migration Engineers** | Execute and monitor COBOL-to-Python conversions | Real-time streaming visibility, step-by-step progress, code diffs |
| **Tech Leads** | Review conversion quality, approve migrations | Quality scores, dependency flowcharts, coverage reports |
| **Enterprise Architects** | Assess migration feasibility and risk | Dependency maps, complexity analysis, risk scoring |
| **QA Engineers** | Validate functional equivalence of converted code | Test stub generation, structural coverage metrics, comparison view |

---

## 3. Design Decisions Log

All architectural decisions were resolved during the design phase. This section serves as the authoritative record.

| # | Question | Decision | Rationale |
|---|---|---|---|
| D-01 | Streaming protocol | **Dual: SSE for agent→UI output + WebSocket for UI→agent steering** | SSE provides automatic reconnection with `Last-Event-ID` resume for the primary output stream; WebSocket enables bidirectional steering commands without REST polling overhead |
| D-02 | Agent execution model | **In-process: asyncio task inside FastAPI worker** | Single-user local app — no need for Celery/worker infrastructure. Simplest architecture, fastest to build, lowest latency |
| D-03 | Session persistence | **Agent runs to completion; user can reconnect and replay events from in-memory buffer** | Agent doesn't depend on UI being connected. Events buffered in-memory during the session for SSE reconnection replay |
| D-04 | Checker timing | **Sequential: agent waits for GPT-5.2-Codex score before proceeding to next module** | Keeps UX linear — score appears immediately after each conversion. Adds ~3-5s per module but avoids out-of-order complexity |
| D-05 | Data residency | **Full code sent to OpenAI API (not a regulated environment)** | No data residency constraints. COBOL source + Python output sent to GPT-5.2-Codex for scoring without obfuscation |
| D-06 | Checker model | **GPT-5.2-Codex confirmed as primary (model: `gpt-5.2-codex`)** | Verified available at https://developers.openai.com/api/docs/models/gpt-5.2-codex. 400K context, $1.75/$14 per 1M tokens, structured output support |
| D-07 | Responsive design | **Desktop-only, minimum 1280px viewport** | Internal engineering tool — COBOL migration happens on workstations. Split-pane layout requires wide viewport |
| D-08 | Diff mapping granularity | **Paragraph-to-function level** | COBOL paragraphs map 1:1 to Python functions in our converter. Visually meaningful without being brittle like line-level mapping |
| D-09 | WebSocket steering commands | **Pause, Resume, Skip Module, Retry Module** | Four concrete commands with well-defined semantics. No free-form instruction injection (destabilizes plan tracker state) |
| D-10 | Graph rendering library | **React Flow for all interactive graphs** | Supports surgical node-level updates without full re-render, zoom/pan, click handlers, custom node components. Mermaid.js re-renders entirely on updates (causes flicker) |
| D-11 | File storage | **Local filesystem** | Application runs locally — files read/written directly to user's disk. No S3, EFS, or remote storage |
| D-12 | RBAC model | **Single role — all authenticated users have full access** | Single-user local app. No auth, no roles, no access control |
| D-13 | Deployment model | **Single user on own machine (like Claude Code CLI)** | No server infrastructure. `pip install`, configure `.env`, run locally |
| D-14 | API key management | **`.env` file with API keys at install time** | Developer-friendly pattern. User sets `OPENAI_API_KEY` and `AWS_PROFILE` / `AWS_ACCESS_KEY_ID` in `.env` |
| D-15 | Authentication | **Dropped entirely** | Localhost traffic only. No auth middleware, no JWT, no SSO |
| D-16 | Error recovery | **Agent retries failed module once, then marks as `skipped` and continues** | Resilient without being stubborn. User can retry skipped modules later via WebSocket steering |
| D-17 | Audit log granularity | **Full content: COBOL source + Python output + scores + agent reasoning** | Comprehensive audit trail for post-conversion review. Stored to local `./output/logs/` directory |
| D-18 | Cost controls | **None — user manages their own API spend** | Local tool, user's own API keys. No guardrails, no budget caps, no confirmation prompts |
| D-19 | Theme scope for exports | **Theme applies only to the React web app** | Exported PDF reports and SVG flowcharts use standard light formatting regardless of active theme |
| D-20 | Crash recovery | **Plan state + partial conversions persisted to disk, recoverable on restart** | `conversion_plan.json` written after every status update. Converted Python files written as completed. On restart, agent resumes from last completed item |
| D-21 | Installation method | **`pip install` + `.env` setup** | Python-native, simplest installation path. No Docker required |

---

## 4. System Architecture

### 4.1 High-Level Architecture

The system is a local application with two processes: a FastAPI backend (Python) and a React dev server (Node.js). The backend hosts the Strands agent and communicates with cloud AI services.

```
┌─────────────────────────────────────────────────────────────────────┐
│ USER'S LOCAL MACHINE                                                │
│                                                                     │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │ REACT UI (localhost:5173)                                      │ │
│  │ React 18 + TypeScript + Vite                                   │ │
│  │ Tailwind CSS (dark: variant) + shadcn/ui                       │ │
│  │ React Flow (dependency graphs + flowcharts)                    │ │
│  │ Monaco Editor (code preview)                                   │ │
│  │ SSE Client (agent output) + WebSocket Client (steering)        │ │
│  └───────────┬──────────────────────────────┬─────────────────────┘ │
│              │ SSE (agent→UI)               │ WS (UI→agent)         │
│  ┌───────────▼──────────────────────────────▼─────────────────────┐ │
│  │ FASTAPI BACKEND (localhost:8000)                               │ │
│  │ SSE streaming endpoint (/api/v1/convert/stream)                │ │
│  │ WebSocket endpoint (/api/v1/ws) — Pause/Resume/Skip/Retry     │ │
│  │ File upload + download endpoints                               │ │
│  │ In-memory event buffer for SSE reconnection replay             │ │
│  │ No auth — localhost only                                       │ │
│  │                                                                │ │
│  │  ┌──────────────────────────────────────────────────────────┐  │ │
│  │  │ AWS STRANDS AGENT (asyncio task, in-process)             │  │ │
│  │  │ Single-threaded master loop (while tool_use → continue)  │  │ │
│  │  │ Tool Registry: cobol_scanner, conversion_planner,        │  │ │
│  │  │   cobol_converter, plan_tracker, validation_checker      │  │ │
│  │  │ StreamHandler callback → SSE event emission              │  │ │
│  │  │ Plan state persisted to disk after every update           │  │ │
│  │  └──────────┬────────────────────────────┬──────────────────┘  │ │
│  └─────────────┼────────────────────────────┼─────────────────────┘ │
│                │                            │                       │
└────────────────┼────────────────────────────┼───────────────────────┘
                 │ HTTPS                      │ HTTPS
    ┌────────────▼──────────┐    ┌────────────▼──────────────┐
    │ AMAZON BEDROCK        │    │ OPENAI API                 │
    │ Claude Sonnet/Opus    │    │ gpt-5.2-codex              │
    │ Code conversion       │    │ Quality scoring            │
    │ InvokeModelWith       │    │ v1/chat/completions        │
    │ ResponseStream        │    │ 400K context, $1.75/$14    │
    │                       │    │ reasoning_effort: high     │
    └───────────────────────┘    └────────────────────────────┘
```

### 4.2 Streaming Data Flow

```
User uploads COBOL files via React UI
        │
        ▼
FastAPI receives files → saves to ./input/
        │
        ▼
React opens SSE connection to /api/v1/convert/stream
React opens WebSocket to /api/v1/ws
        │
        ▼
FastAPI spawns Strands agent as asyncio.Task (in-process)
        │
        ▼
┌─── MASTER AGENT LOOP (while tool_use) ───────────────────────┐
│                                                               │
│  1. cobol_scanner      → SSE: tool_call, tool_result         │
│  2. conversion_planner → SSE: tool_call, plan_update         │
│  3. plan_tracker(next) → get next ready item                 │
│  4. plan_tracker(update_status → in_progress)                │
│  5. cobol_converter    → SSE: tool_call, tool_result         │
│  6. Agent generates Python code → writes to ./output/        │
│  7. GPT-5.2-Codex scoring (SEQUENTIAL — agent waits)         │
│     └─ SSE: score event with 4-dimension ratings             │
│  8. plan_tracker(update_status → completed)                  │
│     └─ Plan state written to disk (crash recovery)           │
│  9. plan_tracker(summary) → context reminder injection       │
│  10. If error: retry once → skip on second failure           │
│  11. Loop back to step 3 until all items completed           │
│                                                               │
│  WebSocket listener checks for steering commands:             │
│    PAUSE  → suspend loop after current tool completes         │
│    RESUME → continue from plan_tracker(next)                  │
│    SKIP   → mark current item as skipped, advance             │
│    RETRY  → reset item to pending, re-run                     │
│                                                               │
└───────────────────────────────────────────────────────────────┘
        │
        ▼
validation_checker runs on all output files
        │
        ▼
SSE: complete event with summary + download path
```

### 4.3 File System Layout

```
project-root/
├── .env                          # OPENAI_API_KEY, AWS_PROFILE, AWS_REGION
├── input/                        # Uploaded COBOL source files
│   ├── ACCT-PROC.cbl
│   ├── ACCT-TYPES.cpy
│   └── ...
├── output/                       # Conversion artifacts
│   ├── conversion_plan.json      # Plan state (persisted on every update)
│   ├── migration_report.md       # Final report
│   ├── shared/                   # Converted COPY books
│   │   └── acct_types.py
│   ├── programs/                 # Converted programs
│   │   └── acct_proc.py
│   ├── tests/                    # Generated test stubs
│   │   └── test_acct_proc.py
│   └── logs/                     # Full audit trail
│       └── session_20260221_143022.jsonl  # COBOL + Python + scores + reasoning
└── .cobol2py/                    # Tool metadata
    └── state.json                # Recovery checkpoint
```

---

## 5. Functional Requirements

### 5.1 FR-1: Dynamic Streaming React UI

The frontend provides a real-time, reactive interface streaming agent activity as it happens. Desktop-only (minimum 1280px viewport).

| ID | Requirement | Priority | Status |
|---|---|---|---|
| FR-1.1 | React 18+ with TypeScript, Vite build tooling | P0 | Required |
| FR-1.2 | SSE client for streaming agent output from FastAPI `/api/v1/convert/stream` | P0 | Required |
| FR-1.3 | WebSocket client for bidirectional steering to FastAPI `/api/v1/ws` | P0 | Required |
| FR-1.4 | Real-time streaming text with typewriter effect for agent reasoning | P0 | Required |
| FR-1.5 | Collapsible tool call panels showing tool name, input params, output, and duration | P0 | Required |
| FR-1.6 | Split-pane layout: agent activity stream (left) + code preview with syntax highlighting (right) | P0 | Required |
| FR-1.7 | Monaco Editor integration for viewing converted Python with syntax highlighting | P1 | Required |
| FR-1.8 | Progress bar tied to `plan_tracker` completion percentage with phase labels | P0 | Required |
| FR-1.9 | Toast notifications for phase transitions (Scan Complete, Plan Ready, etc.) | P1 | Required |
| FR-1.10 | File tree sidebar showing COBOL source structure mapped to converted Python output | P1 | Required |
| FR-1.11 | Desktop-only layout, minimum viewport width 1280px | P0 | Required |

### 5.2 FR-2: FastAPI Streaming Backend

The API tier bridges the React frontend and the AWS Strands agent. Runs locally on `localhost:8000` with no authentication.

| ID | Requirement | Priority | Status |
|---|---|---|---|
| FR-2.1 | FastAPI application with async endpoints, served on `localhost:8000` | P0 | Required |
| FR-2.2 | SSE endpoint: `GET /api/v1/convert/stream` with event types: `reasoning`, `tool_call`, `tool_result`, `plan_update`, `score`, `flowchart`, `error`, `complete` | P0 | Required |
| FR-2.3 | WebSocket endpoint: `WS /api/v1/ws` accepting steering commands: `PAUSE`, `RESUME`, `SKIP`, `RETRY` | P0 | Required |
| FR-2.4 | File upload: `POST /api/v1/upload` accepting multipart COBOL files (.cbl, .cob, .cpy) saved to `./input/` | P0 | Required |
| FR-2.5 | In-memory event buffer for SSE reconnection replay (supports `Last-Event-ID` header) | P1 | Required |
| FR-2.6 | Pydantic v2 models for all request/response schemas with auto-generated OpenAPI docs | P0 | Required |
| FR-2.7 | Agent execution as `asyncio.Task` in-process (no external worker infrastructure) | P0 | Required |
| FR-2.8 | Download: `GET /api/v1/download` returning ZIP of `./output/` directory | P1 | Required |
| FR-2.9 | No authentication — `localhost` only, no JWT, no SSO, no CORS restrictions | P0 | Required |
| FR-2.10 | Startup check: validate `.env` contains required API keys, report clear error if missing | P1 | Required |
| FR-2.11 | Graceful shutdown: on SIGINT/SIGTERM, persist current plan state to disk before exiting | P1 | Required |

### 5.3 FR-3: LLM Quality Checker (GPT-5.2-Codex)

OpenAI GPT-5.2-Codex acts as an independent sequential quality checker. The agent waits for the score before proceeding to the next module.

> **GPT-5.2-Codex Specifications** (verified: https://developers.openai.com/api/docs/models/gpt-5.2-codex)
>
> - **Model string:** `gpt-5.2-codex`
> - **Context window:** 400,000 tokens (no chunking needed — even 5,000 LOC COBOL + Python fits)
> - **Max output tokens:** 128,000
> - **Pricing:** $1.75 / 1M input tokens, $14.00 / 1M output tokens
> - **Cached input:** $0.175 / 1M tokens (10x cheaper on re-runs via content-hash caching)
> - **Reasoning effort:** `low`, `medium`, `high`, `xhigh` — use `high` for scoring
> - **Structured outputs:** Supported (JSON scoring schema enforced at API level)
> - **Endpoint:** `v1/chat/completions`
> - **Streaming:** Supported (but we use non-streaming for structured score JSON)

| ID | Requirement | Priority | Status |
|---|---|---|---|
| FR-3.1 | GPT-5.2-Codex integration via OpenAI `v1/chat/completions` with model `gpt-5.2-codex` | P0 | Required |
| FR-3.2 | **Sequential execution:** agent waits for score before proceeding to next module | P0 | Required |
| FR-3.3 | Scoring input: original COBOL source + converted Python + conversion plan notes sent in single request (fits 400K context) | P0 | Required |
| FR-3.4 | Scoring rubric: Correctness (0-100), Completeness (0-100), Maintainability (0-100), Banking Compliance (0-100) | P0 | Required |
| FR-3.5 | Weighted overall score: Correctness 35%, Completeness 25%, Maintainability 20%, Banking Compliance 20% | P0 | Required |
| FR-3.6 | **Structured output enforcement:** use OpenAI structured outputs feature to guarantee JSON schema compliance | P0 | Required |
| FR-3.7 | Reasoning effort set to `high` for thorough code assessment | P1 | Required |
| FR-3.8 | Score thresholds: Green (≥85), Yellow (70-84), Red (<70) with red items logged for manual review | P1 | Required |
| FR-3.9 | Detailed issue list per module: severity (critical/warning/info), description, line references, remediation suggestion | P1 | Required |
| FR-3.10 | Content-hash caching: cache GPT-5.2-Codex results by SHA-256 of (COBOL source + Python output). On re-run, serve cached score ($0.175 vs $1.75 per 1M input tokens) | P2 | Desired |
| FR-3.11 | Fallback: if OpenAI API is unreachable, fall back to rule-based AST validation with reduced scoring (syntax + coverage only) | P1 | Required |
| FR-3.12 | Score delivered via SSE `score` event immediately after each module conversion completes | P0 | Required |

#### 5.3.1 Scoring Rubric Detail

| Dimension | Weight | Checks | Green (≥) | Red (<) |
|---|---|---|---|---|
| **Correctness** | 35% | Logic equivalence, data type mapping, control flow fidelity, arithmetic precision | 90 | 70 |
| **Completeness** | 25% | All paragraphs converted, no skipped sections, COPY book coverage, file I/O mapped | 85 | 65 |
| **Maintainability** | 20% | Type hints present, docstrings with COBOL references, snake_case naming, code structure | 80 | 60 |
| **Banking Compliance** | 20% | Decimal precision (no float for money), audit logging, error handling, status code mapping | 85 | 70 |

#### 5.3.2 Structured Output Schema

```json
{
  "module": "ACCT-PROC",
  "scores": {
    "correctness": 92,
    "completeness": 88,
    "maintainability": 85,
    "banking_compliance": 90
  },
  "overall": 89.1,
  "threshold": "green",
  "issues": [
    {
      "severity": "warning",
      "dimension": "maintainability",
      "description": "Function calculate_interest() missing return type hint",
      "line": 47,
      "remediation": "Add -> Decimal return type annotation"
    }
  ],
  "summary": "High-quality conversion with minor maintainability improvements needed."
}
```

### 5.4 FR-4: Dark / Light Theme System

Professional dual-theme system for the React web UI only. Exports (PDF, SVG) always use light formatting.

| ID | Requirement | Priority | Status |
|---|---|---|---|
| FR-4.1 | CSS custom properties based theme with Tailwind CSS `dark:` variant | P0 | Required |
| FR-4.2 | System preference detection via `prefers-color-scheme` with manual override toggle | P0 | Required |
| FR-4.3 | Theme persistence in `localStorage` | P1 | Required |
| FR-4.4 | Smooth 200ms transition on theme switch, no layout shift or FOUC | P1 | Required |
| FR-4.5 | Monaco Editor theme sync: VS Code Dark+ (dark) / VS Code Light+ (light) | P1 | Required |
| FR-4.6 | React Flow graph theme sync: dark node/edge colors in dark mode | P1 | Required |
| FR-4.7 | All score indicators meet WCAG 2.1 AA contrast in both themes | P0 | Required |
| FR-4.8 | Streaming panel: Deep Blue terminal aesthetic (`#020E18`) in dark mode, clean white (`#FAFBFC`) in light mode | P1 | Required |
| FR-4.9 | Theme applies to web UI only — exported artifacts (PDF, SVG) use standard light formatting | P0 | Required |

#### 5.4.1 Core Brand Palette

The entire UI is derived from the McKinsey brand palette. All surfaces, accents, and interactive elements map back to these five core colors or their calculated tints/shades.

| Color Name | Hex | RGB | Usage |
|---|---|---|---|
| **White** | `#FFFFFF` | `255, 255, 255` | Light mode backgrounds, dark mode primary text |
| **Black** | `#000000` | `0, 0, 0` | Print fallback only (not used in digital UI) |
| **Deep Blue (900)** | `#051C2C` | `5, 28, 44` | Dark mode backgrounds, light mode primary text, headings, logo on light surfaces |
| **Cyan** | `#00A9F4` | `0, 169, 244` | Primary accent — links, active states, progress indicators, focus rings, step highlights |
| **Electric Blue** | `#1F40E6` | `31, 64, 230` | Secondary accent — interactive graph nodes, hover states, selected items, CTA buttons |

#### 5.4.2 Logo Color Rules

Per brand guidelines, the background determines the logo treatment:

| Background | Logo Color |
|---|---|
| White or light gradient | Deep Blue (900) `#051C2C` |
| Deep Blue (900) or medium/deep gradient | White `#FFFFFF` |
| Black & white print (light bg) | Black `#000000` |
| Black & white print (dark bg) | White `#FFFFFF` (reversed) |

#### 5.4.3 Theme Color Specifications

All CSS custom properties are derived from the core palette. Tints and shades are calculated from Deep Blue (900) and Cyan to maintain palette coherence.

| Element | CSS Variable | Light | Dark |
|---|---|---|---|
| **Background (primary)** | `--bg-primary` | `#FFFFFF` | `#051C2C` |
| **Background (secondary)** | `--bg-secondary` | `#F0F4F7` | `#0A2A3D` |
| **Background (card)** | `--bg-card` | `#FFFFFF` | `#0E3349` |
| **Text (primary)** | `--text-primary` | `#051C2C` | `#FFFFFF` |
| **Text (secondary)** | `--text-secondary` | `#3D5A6E` | `#8FAABB` |
| **Border** | `--border-color` | `#D4DEE5` | `#153D52` |
| **Accent (primary)** | `--accent` | `#00A9F4` | `#00A9F4` |
| **Accent (secondary)** | `--accent-alt` | `#1F40E6` | `#4F6FFF` |
| **Accent hover** | `--accent-hover` | `#0090D1` | `#33BBFF` |
| **Score: Pass** | `--score-green` | `#0D8A6A` | `#34D399` |
| **Score: Warning** | `--score-yellow` | `#B45309` | `#FBBF24` |
| **Score: Fail** | `--score-red` | `#DC2626` | `#F87171` |
| **Code Background** | `--code-bg` | `#F0F4F7` | `#031520` |
| **Streaming Panel** | `--stream-bg` | `#FAFBFC` | `#020E18` |
| **Active Step Glow** | `--step-active` | `#00A9F4` | `#00A9F4` |
| **Completed Step** | `--step-done` | `#0D8A6A` | `#34D399` |
| **Graph Node (pending)** | `--node-pending` | `#D4DEE5` | `#153D52` |
| **Graph Node (in-progress)** | `--node-active` | `#00A9F4` | `#00A9F4` |
| **Graph Node (pass)** | `--node-pass` | `#0D8A6A` | `#34D399` |
| **Graph Node (fail)** | `--node-fail` | `#DC2626` | `#F87171` |
| **Graph Edge (CALL)** | `--edge-call` | `#051C2C` | `#8FAABB` |
| **Graph Edge (COPY)** | `--edge-copy` | `#00A9F4` | `#00A9F4` |
| **Graph Edge (CICS/SQL)** | `--edge-critical` | `#DC2626` | `#F87171` |

### 5.5 FR-5: Step Highlighting and Streaming Visualization

Each phase and step is highlighted, animated, and streamed in real-time with full transparency into the agent loop.

| ID | Requirement | Priority | Status |
|---|---|---|---|
| FR-5.1 | Vertical step timeline: Scan → Plan → Convert → Score → Validate → Report | P0 | Required |
| FR-5.2 | Active step pulsing animation (Cyan `#00A9F4` glow), completed green check, pending grayed (Deep Blue tint) | P0 | Required |
| FR-5.3 | Per-step expandable detail: tool name, duration, input summary, output preview, GPT score | P0 | Required |
| FR-5.4 | Real-time token streaming in reasoning panel with cursor blink | P0 | Required |
| FR-5.5 | Tool call card: slide-in animation, auto-expand on active, auto-collapse on complete | P1 | Required |
| FR-5.6 | Plan checklist overlay (TodoWrite view): live status from `plan_tracker` | P0 | Required |
| FR-5.7 | Conversion diff view: side-by-side COBOL (left) and Python (right) with paragraph-to-function block mapping | P1 | Required |
| FR-5.8 | Score badge animation: fade-in with color ring (green/yellow/red) when score arrives | P1 | Required |
| FR-5.9 | Phase transition banner with duration metrics | P1 | Required |
| FR-5.10 | Auto-scroll with smart pause: auto-scrolls output, pauses on user scroll-up, resumes on scroll-to-bottom | P0 | Required |

#### 5.5.1 SSE Event Type Specification

| Event Type | Payload Schema | UI Behavior |
|---|---|---|
| `reasoning` | `{ id: number, text: string, phase: string }` | Append to streaming panel with typewriter effect; highlight active phase in timeline |
| `tool_call` | `{ id: string, tool: string, input: object }` | Slide-in tool card with icon and name; show input in collapsible section |
| `tool_result` | `{ id: string, tool: string, output: object, duration_ms: number }` | Update tool card with output preview and duration badge; auto-collapse |
| `plan_update` | `{ plan_id: string, items: PlanItem[], progress_pct: number }` | Refresh TodoWrite checklist; update progress bar; highlight changed items |
| `score` | `{ module: string, scores: ScoreObj, overall: number, threshold: string, issues: Issue[] }` | Animate score badge; update module row in dashboard; flag red items |
| `flowchart` | `{ nodes: FlowNode[], edges: FlowEdge[], updated_node_id?: string }` | Update React Flow graph; highlight changed node with Cyan accent (`#00A9F4`) |
| `error` | `{ message: string, tool?: string, recoverable: boolean, retry_count: number }` | Show error toast; if `retry_count < 1`, show "Retrying..."; if `retry_count >= 1`, show "Skipped" |
| `complete` | `{ summary: MigrationReport, output_dir: string }` | Show completion banner; display final aggregate scores; enable download |

### 5.6 FR-6: Code Map and Flowchart Display

Interactive dependency graphs and conversion flowcharts rendered with **React Flow** (not Mermaid.js) for surgical node-level updates without full re-render.

| ID | Requirement | Priority | Status |
|---|---|---|---|
| FR-6.1 | Dependency graph: interactive node-edge diagram showing COBOL CALL/COPY relationships via React Flow | P0 | Required |
| FR-6.2 | React Flow with zoom, pan, minimap, and click-to-focus | P0 | Required |
| FR-6.3 | Live node status updates: gray `#D4DEE5` (pending) → Cyan `#00A9F4` (in-progress) → green `#0D8A6A` (pass, ≥85) / yellow (warning) / red `#DC2626` (fail, <70) | P0 | Required |
| FR-6.4 | Flowchart auto-generation from `conversion_planner` dependency graph output | P0 | Required |
| FR-6.5 | Node click: opens side panel with program details (complexity, LOC, score, conversion status, issues) | P1 | Required |
| FR-6.6 | Complexity heat map: node size proportional to LOC, border thickness to complexity rating | P1 | Required |
| FR-6.7 | Export: download graph as SVG or PNG (always light theme) | P2 | Desired |
| FR-6.8 | Live node updates via SSE `flowchart` events — surgical updates, no full re-render | P0 | Required |
| FR-6.9 | Minimap for large codebases (50+ programs) with viewport indicator | P2 | Desired |
| FR-6.10 | Dark/light theme sync for node colors, edge colors, labels, backgrounds | P1 | Required |
| FR-6.11 | Custom node types: rectangle for programs, rounded for copybooks, diamond for CICS programs | P1 | Required |
| FR-6.12 | Edge types: solid Deep Blue for CALL dependencies, dashed Cyan for COPY dependencies, solid red for SQL/CICS critical paths | P1 | Required |

#### 5.6.1 Flowchart Types

- **Dependency Graph:** Top-down layout showing CALL/COPY relationships. Node shape = type (program/copybook/CICS). Node color = conversion status. Edge style = dependency type. Rendered with React Flow dagre layout.
- **Conversion Pipeline:** Horizontal flow showing agent phases (Scan → Plan → Convert → Score → Validate → Report). Current phase highlighted, completed phases show duration.
- **Module Detail:** Per-program view showing COBOL paragraphs (left nodes) mapped to Python functions (right nodes) with connecting edges. Paragraph-to-function level granularity per D-08.

### 5.7 FR-7: WebSocket Steering Controls

User can control the agent mid-conversion via four well-defined WebSocket commands (D-09).

| ID | Requirement | Priority | Status |
|---|---|---|---|
| FR-7.1 | `PAUSE` command: suspend agent loop after current tool call completes. Agent holds state, no new tool calls. | P0 | Required |
| FR-7.2 | `RESUME` command: continue agent loop from `plan_tracker(action="next")` | P0 | Required |
| FR-7.3 | `SKIP` command: mark current in-progress item as `skipped` in plan tracker, advance to next item | P0 | Required |
| FR-7.4 | `RETRY` command: reset current/specified item to `pending`, re-run conversion from the beginning of that item | P0 | Required |
| FR-7.5 | Steering button bar in React UI: four buttons (Pause/Resume toggle, Skip, Retry) visible during active conversion | P0 | Required |
| FR-7.6 | Command acknowledgment: WebSocket responds with `{ command: "PAUSE", status: "acknowledged", item_id: "..." }` | P1 | Required |
| FR-7.7 | Invalid command handling: if RESUME sent when not paused, respond with `{ status: "invalid", reason: "Agent is not paused" }` | P1 | Required |

### 5.8 FR-8: Crash Recovery and State Persistence

Plan state and partial conversions are persisted to disk continuously, enabling recovery on restart (D-20).

| ID | Requirement | Priority | Status |
|---|---|---|---|
| FR-8.1 | `conversion_plan.json` written to `./output/` after every `plan_tracker` status update | P0 | Required |
| FR-8.2 | Converted Python files written to `./output/programs/` immediately upon completion of each module | P0 | Required |
| FR-8.3 | Recovery checkpoint: `.cobol2py/state.json` records session metadata (start time, current phase, last completed item ID) | P0 | Required |
| FR-8.4 | On startup, detect existing `conversion_plan.json` with incomplete items → prompt user: "Resume previous conversion?" | P0 | Required |
| FR-8.5 | Resume logic: load plan from disk, skip all `completed`/`skipped` items, continue from first `pending` item | P0 | Required |
| FR-8.6 | `SIGINT`/`SIGTERM` handler: persist current plan state and checkpoint before process exit | P1 | Required |
| FR-8.7 | Audit log (`./output/logs/session_*.jsonl`): append-only JSONL with one entry per tool call, result, and score | P0 | Required |
| FR-8.8 | Each audit log entry contains: timestamp, event type, COBOL source (if applicable), Python output (if applicable), GPT-5.2-Codex scores, agent reasoning excerpt | P0 | Required |

---

## 6. API Specification

### 6.1 Local Endpoints

All endpoints served on `localhost:8000`. No authentication.

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/v1/upload` | Upload COBOL source files (multipart) to `./input/` |
| `POST` | `/api/v1/convert` | Start conversion job (returns `{ session_id, status }`) |
| `GET` | `/api/v1/convert/stream` | SSE stream of agent events (supports `Last-Event-ID` for reconnection) |
| `GET` | `/api/v1/convert/status` | Current conversion status, progress percentage, active item |
| `GET` | `/api/v1/convert/plan` | Full conversion plan JSON |
| `GET` | `/api/v1/convert/scores` | All GPT-5.2-Codex quality scores |
| `GET` | `/api/v1/convert/graph` | Current React Flow graph data (nodes + edges) |
| `GET` | `/api/v1/download` | ZIP archive of `./output/` directory |
| `GET` | `/api/v1/config` | Current configuration (model IDs, output dir, loaded API key status) |
| `WS` | `/api/v1/ws` | WebSocket for steering commands (`PAUSE`, `RESUME`, `SKIP`, `RETRY`) |

### 6.2 SSE Event Format

```
event: {type}
id: {sequential_integer}
data: {"session_id": "...", "timestamp": "...", ...payload}

```

The `id` field enables reconnection via `Last-Event-ID`. The in-memory event buffer retains all events for the current session.

---

## 7. Non-Functional Requirements

| ID | Requirement | Priority | Status |
|---|---|---|---|
| NFR-1 | SSE event latency: <100ms from agent tool callback to browser render | P0 | Required |
| NFR-2 | UI initial load time: <2 seconds on localhost (Vite dev server or production build) | P1 | Required |
| NFR-3 | GPT-5.2-Codex scoring latency: <5 seconds per module average (sequential, blocking) | P1 | Required |
| NFR-4 | Conversion throughput: process 10,000 LOC COBOL in <15 minutes end-to-end (including sequential scoring) | P1 | Required |
| NFR-5 | WCAG 2.1 AA accessibility compliance for both dark and light themes | P0 | Required |
| NFR-6 | Minimum viewport: 1280px width (desktop-only) | P0 | Required |
| NFR-7 | React Flow graph rendering: <500ms for graphs up to 100 nodes | P1 | Required |
| NFR-8 | Full audit logging: all events + source + output + scores to `./output/logs/` | P0 | Required |
| NFR-9 | Crash recovery: resume from last completed item with <10 second startup time | P0 | Required |
| NFR-10 | Memory: support codebases up to 500 COBOL programs without exceeding 4GB RAM | P1 | Required |
| NFR-11 | Disk: conversion artifacts for 500 programs fit within 2GB including full audit logs | P1 | Required |
| NFR-12 | Python 3.11+ required; Node.js 18+ for React dev server | P0 | Required |

---

## 8. Technology Stack

| Layer | Technology | Rationale |
|---|---|---|
| **Frontend Framework** | React 18 + TypeScript + Vite | Industry standard, strong typing, fast HMR, local dev server |
| **UI Styling** | Tailwind CSS + shadcn/ui | Utility-first with `dark:` variant, accessible components |
| **Code Editor** | Monaco Editor (`@monaco-editor/react`) | VS Code engine, syntax highlighting, theme sync |
| **Graph Visualization** | React Flow (`@xyflow/react`) | Surgical node-level updates, zoom/pan, custom nodes, dagre layout (D-10) |
| **API Framework** | FastAPI 0.115+ | Async-native, SSE support, WebSocket support, auto OpenAPI docs |
| **Agent SDK** | AWS Strands SDK (`strands-agents`) | Production-grade agent loop with tool registry |
| **Conversion Model** | Amazon Bedrock (Claude Sonnet/Opus) | Best-in-class code generation via `InvokeModelWithResponseStream` |
| **Quality Checker** | OpenAI GPT-5.2-Codex (`gpt-5.2-codex`) | 400K context, structured outputs, $1.75/$14, reasoning effort support |
| **Installation** | `pip install cobol2py` + `.env` | Python-native, no Docker, no server infrastructure (D-21) |
| **Process Manager** | `uvicorn` (FastAPI) + `vite dev` (React) | Two local processes, no orchestration needed |

**Removed from v1.0 (cloud-only, not applicable to local-first):** Redis, AWS Cognito, JWT auth, ECS Fargate, EKS, CodePipeline, S3, CORS middleware.

---

## 9. User Stories

### 9.1 Migration Engineer Stories

- **US-1:** As a migration engineer, I want to run `pip install cobol2py`, configure my `.env`, and start converting COBOL files with a single command, so I can get started in under 5 minutes.
- **US-2:** As a migration engineer, I want to see a real-time streaming view of the agent scanning, planning, and converting each file, so I can monitor progress without switching tools.
- **US-3:** As a migration engineer, I want each conversion step highlighted with a pulsing indicator, tool details, and GPT-5.2-Codex scores, so I know exactly what the agent is doing and how well it performed.
- **US-4:** As a migration engineer, I want to pause the conversion, skip a problematic module, and resume without restarting the entire job.
- **US-5:** As a migration engineer, I want to toggle dark/light themes for comfortable extended sessions.
- **US-6:** As a migration engineer, I want the tool to recover from a crash and resume from where it left off, so I don't lose hours of conversion progress.

### 9.2 Tech Lead Stories

- **US-7:** As a tech lead, I want to see GPT-5.2-Codex quality scores for each module appear in real-time as conversions complete, with red items flagged for manual review.
- **US-8:** As a tech lead, I want an interactive React Flow dependency graph that updates node colors as programs are converted, so I can assess impact of any failures on downstream programs.
- **US-9:** As a tech lead, I want a TodoWrite-style checklist showing the conversion plan with live status updates and completion percentage.

### 9.3 Enterprise Architect Stories

- **US-10:** As an architect, I want to see a dependency map with complexity heat mapping (node size = LOC, border = complexity) before conversion starts, so I can plan resource allocation.
- **US-11:** As an architect, I want the graph to distinguish CICS programs (diamond nodes) and SQL/CICS edges (red-highlighted) so I can identify programs needing architectural redesign.

---

## 10. Release Plan and Milestones

| Phase | Target Date | Deliverables | Status |
|---|---|---|---|
| **Phase 1** | Mar 2026 | FastAPI backend with SSE streaming + AWS Strands agent + 5 conversion tools + `pip install` setup | Planned |
| **Phase 2** | Apr 2026 | React UI with streaming panels, step timeline, dark/light theme, progress bar, file tree | Planned |
| **Phase 3** | May 2026 | GPT-5.2-Codex sequential quality checker with structured scoring, score badges, dashboard | Planned |
| **Phase 4** | Jun 2026 | React Flow dependency graphs, conversion pipeline, module detail, live node updates | Planned |
| **Phase 5** | Jul 2026 | WebSocket steering (Pause/Resume/Skip/Retry), Monaco Editor, paragraph-to-function diff view | Planned |
| **Phase 6** | Aug 2026 | Crash recovery, audit logging, performance optimization, documentation, v1.0 release | Planned |

---

## 11. Risks and Mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| **GPT-5.2-Codex API rate limits** | High | Content-hash caching (FR-3.10), exponential backoff retry. Tier 1 allows 500 RPM / 500K TPM — sufficient for sequential scoring |
| **GPT-5.2-Codex API outage** | Medium | Rule-based AST fallback scorer (FR-3.11) providing syntax + coverage scoring only. Clear UI indicator when fallback is active |
| **Sequential scoring adds latency** | Medium | Accepted tradeoff (D-04) for linear UX. ~3-5s per module × N modules. Cached re-runs are 10x faster ($0.175 vs $1.75 input) |
| **COBOL dialect variations** | High | Extensible parser with dialect plugins in `cobol_scanner`. Pre-scan validation. User-configurable parse rules |
| **SSE connection drops** | Medium | `Last-Event-ID` reconnection with in-memory event buffer replay (FR-2.5). Agent continues regardless (D-03) |
| **Bedrock token limits for large programs** | Medium | Chunked conversion with context window management. Program splitting for >5,000 LOC files |
| **Process crash at 80% completion** | High | Continuous disk persistence of plan state + partial outputs (FR-8). Resume from last completed item on restart |
| **Financial precision loss** | Critical | Mandatory `Decimal` type enforcement, COMP-3 specific test cases, GPT-5.2-Codex banking compliance dimension (20% weight) |
| **React Flow performance for 100+ nodes** | Low | Dagre layout with virtualization. Minimap for navigation (FR-6.9). Tested against NFR-7 (< 500ms render) |

---

## 12. Appendix

### 12.1 Glossary

| Term | Definition |
|---|---|
| **SSE** | Server-Sent Events: HTTP-based unidirectional streaming protocol (server→client) with automatic reconnection |
| **TodoWrite** | Claude Code planning pattern: structured JSON task lists with status tracking and context reminder injection |
| **Strands SDK** | AWS open-source framework for building production AI agents with tool registries |
| **GPT-5.2-Codex** | OpenAI coding model (`gpt-5.2-codex`). 400K context, $1.75/$14 per 1M tokens. Optimized for agentic coding |
| **React Flow** | React library for building interactive node-based graphs with surgical updates (replaced Mermaid.js per D-10) |
| **COMP-3** | COBOL packed decimal data type requiring precise `Decimal` mapping in Python |
| **CICS** | Customer Information Control System: IBM transaction processing middleware requiring architectural migration |
| **Monaco Editor** | VS Code editor engine for web, providing syntax highlighting and IntelliSense |
| **Dagre** | Directed graph layout algorithm used by React Flow for automatic node positioning |

### 12.2 References

- GPT-5.2-Codex Model Page: https://developers.openai.com/api/docs/models/gpt-5.2-codex
- GPT-5.2-Codex Prompting Guide: https://developers.openai.com/cookbook/examples/gpt-5/codex_prompting_guide
- AWS Strands SDK: https://github.com/strands-agents/sdk-python
- Amazon Bedrock Developer Guide: https://docs.aws.amazon.com/bedrock/
- React Flow Documentation: https://reactflow.dev/
- FastAPI SSE: https://fastapi.tiangolo.com/advanced/custom-response/#streamingresponse
- Claude Code Architecture: See companion `agent.py` implementation

### 12.3 Document History

| Version | Date | Author | Changes |
|---|---|---|---|
| 1.0 | Feb 21, 2026 | Francisco | Initial PRD creation |
| 2.0 | Feb 21, 2026 | Francisco | 21 design decisions resolved. Local-first architecture. Removed cloud infrastructure (Redis, ECS, Cognito, JWT). Added GPT-5.2-Codex verified specs ($1.75/$14, 400K context). Switched Mermaid.js → React Flow. Added FR-7 (WebSocket steering), FR-8 (crash recovery). Updated all requirements, milestones, and risks. |
| 2.1 | Feb 21, 2026 | Francisco | Adopted McKinsey brand palette: Deep Blue (900) `#051C2C`, Cyan `#00A9F4`, Electric Blue `#1F40E6`. Added logo color rules, brand-derived CSS variables (22 tokens), graph node/edge color specifications. All UI color references updated to palette. |
