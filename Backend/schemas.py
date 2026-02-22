"""
Pydantic v2 Schemas
====================
Request/response models and SSE event schemas for the FastAPI backend.
Matches the event type specification from PRD Section 5.5.1.
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------
class SessionStatus(str, Enum):
    IDLE = "idle"
    RUNNING = "running"
    PAUSED = "paused"
    COMPLETED = "completed"
    FAILED = "failed"


class SteeringAction(str, Enum):
    PAUSE = "PAUSE"
    RESUME = "RESUME"
    SKIP = "SKIP"
    RETRY = "RETRY"


class ScoreThreshold(str, Enum):
    GREEN = "green"
    YELLOW = "yellow"
    RED = "red"


class IssueSeverity(str, Enum):
    CRITICAL = "critical"
    WARNING = "warning"
    INFO = "info"


# ---------------------------------------------------------------------------
# Request Models
# ---------------------------------------------------------------------------
class ConvertRequest(BaseModel):
    cobol_dir: Optional[str] = None
    output_dir: str = "./output"


class SteeringCommand(BaseModel):
    command: SteeringAction
    item_id: Optional[str] = None


# ---------------------------------------------------------------------------
# Response Models
# ---------------------------------------------------------------------------
class UploadResponse(BaseModel):
    files: list[str]
    total_files: int
    input_dir: str


class ConvertStartResponse(BaseModel):
    session_id: str
    status: SessionStatus


class ConversionStatus(BaseModel):
    session_id: Optional[str] = None
    status: SessionStatus
    current_phase: Optional[str] = None
    current_item_id: Optional[str] = None
    progress_pct: float = 0.0
    start_time: Optional[datetime] = None
    elapsed_seconds: Optional[float] = None


class SteeringResponse(BaseModel):
    command: str
    status: str
    item_id: Optional[str] = None
    reason: Optional[str] = None


class ConfigResponse(BaseModel):
    advance_llm_model: str
    output_dir: str
    input_dir: str
    anthropic_key_set: bool
    openai_key_set: bool


# ---------------------------------------------------------------------------
# Score Models (PRD Section 5.3.2)
# ---------------------------------------------------------------------------
class ScoreIssue(BaseModel):
    severity: IssueSeverity
    dimension: str
    description: str
    line: Optional[int] = None
    remediation: Optional[str] = None


class ScoreDimensions(BaseModel):
    correctness: int = Field(ge=0, le=100)
    completeness: int = Field(ge=0, le=100)
    maintainability: int = Field(ge=0, le=100)
    banking_compliance: int = Field(ge=0, le=100)


class ModuleScore(BaseModel):
    module: str
    scores: ScoreDimensions
    overall: float
    threshold: ScoreThreshold
    issues: list[ScoreIssue] = []
    summary: str = ""
    fallback: bool = False


# ---------------------------------------------------------------------------
# SSE Event Payloads (PRD Section 5.5.1)
# ---------------------------------------------------------------------------
class ReasoningEvent(BaseModel):
    id: int
    text: str
    phase: str


class ToolCallEvent(BaseModel):
    id: str
    tool: str
    input: dict[str, Any] = {}


class ToolResultEvent(BaseModel):
    id: str
    tool: str
    output: dict[str, Any] = {}
    duration_ms: int = 0


class PlanItem(BaseModel):
    id: str
    title: str
    status: str
    phase: str
    program_id: str
    complexity: str = ""
    score: Optional[float] = None


class PlanUpdateEvent(BaseModel):
    plan_id: str
    items: list[PlanItem]
    progress_pct: float


class ScoreEvent(ModuleScore):
    """SSE score event — same shape as ModuleScore."""
    pass


class FlowNode(BaseModel):
    id: str
    label: str
    type: str = "program"  # program | copybook | cics
    status: str = "pending"
    complexity: str = ""
    loc: int = 0
    score: Optional[float] = None
    has_sql: bool = False
    has_cics: bool = False
    source_file: str = ""
    position: Optional[dict[str, float]] = None


class FlowEdge(BaseModel):
    id: str
    source: str
    target: str
    type: str = "CALL"  # CALL | COPY


class FlowchartEvent(BaseModel):
    nodes: list[FlowNode]
    edges: list[FlowEdge]
    updated_node_id: Optional[str] = None


class ErrorEvent(BaseModel):
    message: str
    tool: Optional[str] = None
    recoverable: bool = True
    retry_count: int = 0


class CompleteEvent(BaseModel):
    summary: dict[str, Any] = {}
    output_dir: str = ""
    total_modules: int = 0
    completed_modules: int = 0
    skipped_modules: int = 0
    scores: list[ModuleScore] = []
