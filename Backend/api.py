"""
FastAPI Streaming Backend
==========================
Local-first API server bridging the React UI and the Strands agent.
Serves on localhost:8000 with no authentication (FR-2.9).

Endpoints:
  POST /api/v1/upload          — Upload COBOL source files
  POST /api/v1/convert         — Start conversion job
  GET  /api/v1/convert/stream  — SSE stream of agent events
  GET  /api/v1/convert/status  — Current conversion status
  GET  /api/v1/convert/plan    — Full conversion plan JSON
  GET  /api/v1/convert/scores  — All quality scores
  GET  /api/v1/convert/graph   — React Flow graph data
  GET  /api/v1/download        — ZIP of output directory
  GET  /api/v1/config          — Current configuration
  WS   /api/v1/ws              — WebSocket for steering commands

Author: Francisco | Truist Technology & AI
"""

import asyncio
import io
import json
import logging
import signal
import zipfile
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, File, HTTPException, Request, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from sse_starlette.sse import EventSourceResponse

from Backend.audit_log import audit_log
from Backend.config import get_settings
from Backend.event_bus import event_bus
from Backend.session import Session, session
from Backend.schemas import (
    CompleteEvent,
    ConfigResponse,
    ConversionStatus,
    ConvertRequest,
    ConvertStartResponse,
    FlowEdge,
    FlowNode,
    FlowchartEvent,
    ModuleScore,
    SessionStatus,
    SteeringAction,
    SteeringCommand,
    SteeringResponse,
    UploadResponse,
)

logger = logging.getLogger(__name__)
settings = get_settings()

# COBOL file extensions accepted for upload
COBOL_EXTENSIONS = {".cbl", ".cob", ".cpy", ".cobol", ".pco"}


# ---------------------------------------------------------------------------
# Lifespan: startup / shutdown
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: bind event bus to loop. Shutdown: persist plan state (FR-2.11)."""
    loop = asyncio.get_running_loop()
    event_bus.bind_loop(loop)

    # Register signal handlers for graceful shutdown
    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, lambda s=sig: asyncio.create_task(_shutdown(s)))

    logger.info(f"Server starting on http://{settings.HOST}:{settings.PORT}")
    logger.info(f"  Input directory:  {settings.INPUT_DIR}")
    logger.info(f"  Output directory: {settings.OUTPUT_DIR}")
    yield
    # Cleanup on shutdown
    await _persist_state()


async def _shutdown(sig: signal.Signals) -> None:
    """Persist plan state before exiting (FR-2.11, FR-8.6)."""
    logger.info(f"Received {sig.name}, persisting state...")
    await _persist_state()


async def _persist_state() -> None:
    """Save current plan state and checkpoint to disk."""
    state_dir = Path(".cobol2py")
    state_dir.mkdir(exist_ok=True)
    state = {
        "session_id": session.session_id,
        "status": session.status.value,
        "current_phase": session.current_phase,
        "current_item_id": session.current_item_id,
        "progress_pct": session.progress_pct,
        "timestamp": datetime.now().isoformat(),
    }
    (state_dir / "state.json").write_text(json.dumps(state, indent=2))
    logger.info("State persisted to .cobol2py/state.json")


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------
app = FastAPI(
    title="COBOL-to-Python Migration Platform",
    version="1.0.0",
    lifespan=lifespan,
)

# No CORS restrictions for localhost (FR-2.9)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# POST /api/v1/upload — File upload (FR-2.4)
# ---------------------------------------------------------------------------
@app.post("/api/v1/upload", response_model=UploadResponse)
async def upload_files(files: list[UploadFile] = File(...)):
    """Upload COBOL source files to the input directory."""
    if not files:
        raise HTTPException(status_code=400, detail="No files provided in upload request.")

    input_dir = Path(settings.INPUT_DIR)
    try:
        input_dir.mkdir(parents=True, exist_ok=True)
    except OSError as exc:
        logger.error(f"Cannot create input directory {input_dir}: {exc}")
        raise HTTPException(
            status_code=500,
            detail=f"Cannot create input directory ({input_dir}): {exc}",
        )

    saved_files: list[str] = []
    for f in files:
        safe_name = Path(f.filename or "").name
        if not safe_name:
            continue
        ext = Path(safe_name).suffix.lower()
        if ext not in COBOL_EXTENSIONS:
            continue

        dest = input_dir / safe_name
        try:
            content = await f.read()
            dest.write_bytes(content)
            saved_files.append(safe_name)
        except Exception as exc:
            logger.error(f"Failed to write {safe_name} to {dest}: {exc}")
            raise HTTPException(
                status_code=500,
                detail=f"Failed to save file '{safe_name}': {exc}",
            )

    if not saved_files:
        raise HTTPException(
            status_code=400,
            detail=f"No valid COBOL files uploaded. Accepted extensions: {', '.join(sorted(COBOL_EXTENSIONS))}",
        )

    logger.info(f"Uploaded {len(saved_files)} file(s) to {input_dir}: {saved_files}")
    return UploadResponse(
        files=saved_files,
        total_files=len(saved_files),
        input_dir=str(input_dir),
    )


# ---------------------------------------------------------------------------
# POST /api/v1/convert — Start conversion (FR-2.7)
# ---------------------------------------------------------------------------
@app.post("/api/v1/convert", response_model=ConvertStartResponse)
async def start_conversion(request: ConvertRequest = ConvertRequest()):
    """Start COBOL-to-Python conversion as an asyncio task."""
    if session.status == SessionStatus.RUNNING:
        raise HTTPException(status_code=409, detail="Conversion already in progress")

    cobol_dir = request.cobol_dir or settings.INPUT_DIR
    output_dir = request.output_dir or settings.OUTPUT_DIR

    # Validate source directory has COBOL files
    source_path = Path(cobol_dir)
    if not source_path.exists():
        raise HTTPException(status_code=404, detail=f"Source directory not found: {cobol_dir}")

    # Clear previous events and start new session
    event_bus.clear()
    session_id = session.start()

    # Spawn agent as asyncio task (in-process, FR-2.7)
    session.agent_task = asyncio.create_task(
        _run_agent(cobol_dir, output_dir)
    )

    return ConvertStartResponse(
        session_id=session_id,
        status=SessionStatus.RUNNING,
    )


async def _run_agent(cobol_dir: str, output_dir: str, resume: bool = False) -> None:
    """Run the Strands agent in a background asyncio task."""
    # Import here to avoid circular imports at module level
    from Backend.Agents.agent import run_conversion

    # Start audit logging (FR-8.7)
    audit_log.start_session(output_dir, session.session_id)

    def emit(event_type: str, payload: dict) -> None:
        enriched = {
            "session_id": session.session_id,
            "timestamp": datetime.now().isoformat(),
            **payload,
        }
        event_bus.emit(event_type, enriched)

        # Keep session state in sync for the REST status endpoint
        if event_type == "plan_update":
            progress = payload.get("progress_pct", 0)
            items = payload.get("items", [])
            current_item = next((i for i in items if i.get("status") == "in_progress"), None)
            phase = current_item.get("phase", session.current_phase) if current_item else session.current_phase
            item_id = current_item.get("id", "") if current_item else ""
            session.update_progress(phase, item_id, progress)
        elif event_type == "score":
            session.scores.append(payload)

        # Also write to audit log (FR-8.8)
        try:
            audit_log.log_event(event_type, enriched)
        except Exception as exc:
            logger.warning(f"Audit log write failed (non-fatal): {exc}")

    def check_steering() -> dict:
        """Called from the agent thread to check steering flags."""
        return {
            "pause_requested": session.pause_requested,
            "skip_requested": session.skip_requested,
            "retry_item_id": session.retry_item_id,
        }

    max_retries = 1  # D-16: retry once, then skip

    try:
        # Run the synchronous agent in a thread pool
        loop = asyncio.get_running_loop()
        result = await loop.run_in_executor(
            None,
            lambda: run_conversion(
                cobol_dir, output_dir,
                event_callback=emit,
                steering_checker=check_steering,
            ),
        )

        result_text = result.get("text", "") if isinstance(result, dict) else str(result)
        token_usage = result.get("token_usage") if isinstance(result, dict) else None

        session.complete()
        emit("complete", {
            "summary": {"report": result_text[:2000] if result_text else ""},
            "output_dir": output_dir,
            "token_usage": token_usage,
        })
        audit_log.end_session({"status": "completed", "output_dir": output_dir})

    except Exception as e:
        retry_count = session.record_retry("agent_main")

        if retry_count <= max_retries:
            # D-16: auto-retry once
            logger.warning(f"Agent failed (attempt {retry_count}), retrying...")
            error_payload = {
                "session_id": session.session_id,
                "message": f"Agent error (retry {retry_count}/{max_retries}): {e}",
                "recoverable": True,
                "retry_count": retry_count,
            }
            event_bus.emit("error", error_payload)
            audit_log.log_event("error", error_payload)

            # Retry the agent
            try:
                loop = asyncio.get_running_loop()
                result = await loop.run_in_executor(
                    None,
                    lambda: run_conversion(
                        cobol_dir, output_dir,
                        event_callback=emit,
                        steering_checker=check_steering,
                    ),
                )

                result_text = result.get("text", "") if isinstance(result, dict) else str(result)
                token_usage = result.get("token_usage") if isinstance(result, dict) else None

                session.complete()
                emit("complete", {
                    "summary": {"report": result_text[:2000] if result_text else ""},
                    "output_dir": output_dir,
                    "token_usage": token_usage,
                })
                audit_log.end_session({"status": "completed_after_retry", "output_dir": output_dir})
                return
            except Exception as e2:
                logger.exception(f"Agent failed on retry: {e2}")

        # D-16: second failure — mark as failed
        logger.exception("Agent failed permanently")
        session.fail()
        error_payload = {
            "session_id": session.session_id,
            "message": str(e),
            "recoverable": False,
            "retry_count": retry_count,
        }
        event_bus.emit("error", error_payload)
        audit_log.log_event("error", error_payload)
        audit_log.end_session({"status": "failed", "error": str(e)})


# ---------------------------------------------------------------------------
# GET /api/v1/convert/stream — SSE endpoint (FR-2.2)
# ---------------------------------------------------------------------------
@app.get("/api/v1/convert/stream")
async def stream_events(request: Request):
    """SSE stream of agent events with Last-Event-ID reconnection support."""
    last_event_id = 0
    header_id = request.headers.get("Last-Event-ID")
    if header_id and header_id.isdigit():
        last_event_id = int(header_id)

    async def generate():
        async for sse_data in event_bus.stream(last_event_id=last_event_id):
            if await request.is_disconnected():
                break
            yield sse_data

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# ---------------------------------------------------------------------------
# GET /api/v1/convert/status
# ---------------------------------------------------------------------------
@app.get("/api/v1/convert/status", response_model=ConversionStatus)
async def get_status():
    """Return current conversion session status."""
    return ConversionStatus(
        session_id=session.session_id or None,
        status=session.status,
        current_phase=session.current_phase or None,
        current_item_id=session.current_item_id or None,
        progress_pct=session.progress_pct,
        start_time=session.start_time,
        elapsed_seconds=session.elapsed_seconds(),
    )


# ---------------------------------------------------------------------------
# GET /api/v1/convert/resume — Check for resumable conversion (FR-8.4, FR-8.5)
# ---------------------------------------------------------------------------
@app.get("/api/v1/convert/resume")
async def check_resume():
    """Check if a previous interrupted conversion can be resumed."""
    return Session.has_incomplete_conversion(settings.OUTPUT_DIR)


# ---------------------------------------------------------------------------
# POST /api/v1/convert/resume — Resume interrupted conversion (FR-8.5)
# ---------------------------------------------------------------------------
@app.post("/api/v1/convert/resume", response_model=ConvertStartResponse)
async def resume_conversion():
    """Resume a previously interrupted conversion from where it left off."""
    check = Session.has_incomplete_conversion(settings.OUTPUT_DIR)
    if not check.get("resumable"):
        raise HTTPException(status_code=404, detail="No resumable conversion found")

    if session.status == SessionStatus.RUNNING:
        raise HTTPException(status_code=409, detail="Conversion already in progress")

    # Determine source directory from existing plan
    cobol_dir = settings.INPUT_DIR
    plan_path = Path(settings.OUTPUT_DIR) / "conversion_plan.json"
    if plan_path.exists():
        plan = json.loads(plan_path.read_text())
        # Try to infer source dir from first item
        items = plan.get("items", [])
        for item in items:
            src = item.get("source_file", "")
            if src:
                parent = str(Path(src).parent)
                if Path(parent).exists():
                    cobol_dir = parent
                    break

    event_bus.clear()
    session_id = session.start()

    session.agent_task = asyncio.create_task(
        _run_agent(cobol_dir, settings.OUTPUT_DIR, resume=True)
    )

    return ConvertStartResponse(
        session_id=session_id,
        status=SessionStatus.RUNNING,
    )


# ---------------------------------------------------------------------------
# DELETE /api/v1/convert/resume — Discard checkpoint and start fresh
# ---------------------------------------------------------------------------
@app.delete("/api/v1/convert/resume")
async def discard_resume():
    """Discard the saved checkpoint so user can start a fresh conversion."""
    Session.clear_checkpoint()
    return {"cleared": True}


# ---------------------------------------------------------------------------
# DELETE /api/v1/files — Delete all input and output files for a fresh start
# ---------------------------------------------------------------------------
@app.delete("/api/v1/files")
async def clear_files():
    """Delete all files in the input and output directories for a fresh start."""
    import shutil
    deleted = {"input": 0, "output": 0}

    for label, dir_path in [("input", settings.INPUT_DIR), ("output", settings.OUTPUT_DIR)]:
        p = Path(dir_path)
        if p.exists():
            for item in p.iterdir():
                try:
                    if item.is_file():
                        item.unlink()
                    elif item.is_dir():
                        shutil.rmtree(item)
                    deleted[label] += 1
                except Exception as exc:
                    logger.warning(f"Failed to delete {item}: {exc}")

    logger.info(f"Cleared files: {deleted['input']} input, {deleted['output']} output")
    return {"cleared": True, **deleted}


# ---------------------------------------------------------------------------
# GET /api/v1/convert/plan
# ---------------------------------------------------------------------------
@app.get("/api/v1/convert/plan")
async def get_plan():
    """Return the full conversion plan JSON."""
    plan_path = Path(settings.OUTPUT_DIR) / "conversion_plan.json"
    if not plan_path.exists():
        raise HTTPException(status_code=404, detail="No conversion plan found. Start a conversion first.")
    return json.loads(plan_path.read_text())


# ---------------------------------------------------------------------------
# GET /api/v1/convert/scores
# ---------------------------------------------------------------------------
@app.get("/api/v1/convert/scores")
async def get_scores():
    """Return all quality scores collected during the current session."""
    return {"scores": session.scores}


# ---------------------------------------------------------------------------
# GET /api/v1/convert/graph — React Flow graph data
# ---------------------------------------------------------------------------
@app.get("/api/v1/convert/graph")
async def get_graph():
    """Return dependency graph formatted for React Flow with enriched metadata."""
    plan_path = Path(settings.OUTPUT_DIR) / "conversion_plan.json"
    if not plan_path.exists():
        raise HTTPException(status_code=404, detail="No conversion plan found.")

    plan = json.loads(plan_path.read_text())
    dep_graph = plan.get("dependency_graph", {"nodes": [], "edges": []})
    items = plan.get("items", [])

    # Build lookups from plan items
    item_by_program: dict[str, dict] = {}
    for item in items:
        pid = item.get("program_id", "")
        if pid and pid not in ("INTEGRATION", "VALIDATION"):
            item_by_program[pid] = item

    # Score lookup from session
    score_by_module: dict[str, float] = {}
    for s in session.scores:
        mod = s.get("module", "") if isinstance(s, dict) else getattr(s, "module", "")
        overall = s.get("overall", 0) if isinstance(s, dict) else getattr(s, "overall", 0)
        score_by_module[mod] = overall

    # Convert to React Flow format
    nodes = []
    for node in dep_graph.get("nodes", []):
        program_id = node.get("id", "")
        item = item_by_program.get(program_id, {})
        source_file = item.get("source_file", node.get("file", ""))
        is_copybook = source_file.lower().endswith((".cpy", ".copy"))

        # Determine node type
        if item.get("conversion_notes", {}).get("cics_strategy"):
            node_type = "cics"
        elif is_copybook:
            node_type = "copybook"
        else:
            node_type = "program"

        nodes.append(FlowNode(
            id=program_id,
            label=program_id,
            type=node_type,
            status=item.get("status", "pending"),
            complexity=node.get("complexity", ""),
            loc=node.get("loc", 0),
            score=score_by_module.get(program_id.lower().replace("-", "_")),
            has_sql=bool(item.get("conversion_notes", {}).get("sql_strategy")),
            has_cics=bool(item.get("conversion_notes", {}).get("cics_strategy")),
            source_file=source_file,
        ).model_dump())

    edges = []
    for i, edge in enumerate(dep_graph.get("edges", [])):
        edges.append(FlowEdge(
            id=f"e{i}",
            source=edge.get("from", ""),
            target=edge.get("to", ""),
            type=edge.get("type", "CALL"),
        ).model_dump())

    return {"nodes": nodes, "edges": edges}


# ---------------------------------------------------------------------------
# GET /api/v1/files — List converted files for editor (FR-5.7)
# ---------------------------------------------------------------------------
@app.get("/api/v1/files")
async def list_files():
    """List all files in the output and input directories for code preview."""
    files: dict[str, list[dict]] = {"cobol": [], "python": []}

    # COBOL source files
    input_path = Path(settings.INPUT_DIR)
    if input_path.exists():
        for f in sorted(input_path.rglob("*")):
            if f.is_file() and f.suffix.lower() in COBOL_EXTENSIONS:
                files["cobol"].append({
                    "path": str(f),
                    "name": f.name,
                    "relative": str(f.relative_to(input_path)),
                })

    # Also check Data/ for COBOL samples
    data_path = Path("Data")
    if data_path.exists():
        for f in sorted(data_path.rglob("*")):
            if f.is_file() and f.suffix.lower() in COBOL_EXTENSIONS:
                files["cobol"].append({
                    "path": str(f),
                    "name": f.name,
                    "relative": str(f.relative_to(data_path)),
                })

    # Converted Python files
    output_path = Path(settings.OUTPUT_DIR)
    if output_path.exists():
        for f in sorted(output_path.rglob("*.py")):
            if f.is_file() and "__pycache__" not in str(f):
                files["python"].append({
                    "path": str(f),
                    "name": f.name,
                    "relative": str(f.relative_to(output_path)),
                })

    return files


# ---------------------------------------------------------------------------
# GET /api/v1/files/content — Serve file content (FR-5.7)
# ---------------------------------------------------------------------------
@app.get("/api/v1/files/content")
async def get_file_content(path: str):
    """Return the content of a specific file for the code editor."""
    file_path = Path(path)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail=f"File not found: {path}")

    # Security: only allow reading from input, output, or Data directories
    allowed_roots = [
        Path(settings.INPUT_DIR).resolve(),
        Path(settings.OUTPUT_DIR).resolve(),
        Path("Data").resolve(),
    ]
    resolved = file_path.resolve()
    if not any(str(resolved).startswith(str(root)) for root in allowed_roots):
        raise HTTPException(status_code=403, detail="Access denied: path outside allowed directories")

    try:
        content = file_path.read_text(encoding="utf-8", errors="replace")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error reading file: {e}")

    # Determine language
    lang = "python"
    if file_path.suffix.lower() in COBOL_EXTENSIONS:
        lang = "cobol"
    elif file_path.suffix.lower() == ".json":
        lang = "json"

    return {"path": str(file_path), "name": file_path.name, "content": content, "language": lang}


# ---------------------------------------------------------------------------
# GET /api/v1/download — ZIP archive (FR-2.8)
# ---------------------------------------------------------------------------
@app.get("/api/v1/download")
async def download_output():
    """Download the output directory as a ZIP archive."""
    output_path = Path(settings.OUTPUT_DIR)
    if not output_path.exists():
        raise HTTPException(status_code=404, detail="No output directory found.")

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for file_path in output_path.rglob("*"):
            if file_path.is_file():
                arcname = file_path.relative_to(output_path)
                zf.write(file_path, arcname)

    buf.seek(0)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={"Content-Disposition": f"attachment; filename=cobol2py_output_{timestamp}.zip"},
    )


# ---------------------------------------------------------------------------
# GET /api/v1/config
# ---------------------------------------------------------------------------
@app.get("/api/v1/config", response_model=ConfigResponse)
async def get_config():
    """Return current configuration (no secrets exposed)."""
    return ConfigResponse(
        advance_llm_model=settings.ADVANCE_LLM_MODEL,
        output_dir=settings.OUTPUT_DIR,
        input_dir=settings.INPUT_DIR,
        anthropic_key_set=bool(settings.ANTHROPIC_API_KEY),
        openai_key_set=bool(settings.OPENAI_API_KEY),
    )


# ---------------------------------------------------------------------------
# WS /api/v1/ws — WebSocket steering (FR-2.3, FR-7)
# ---------------------------------------------------------------------------
@app.websocket("/api/v1/ws")
async def websocket_steering(ws: WebSocket):
    """WebSocket endpoint for steering commands: PAUSE, RESUME, SKIP, RETRY."""
    await ws.accept()
    try:
        while True:
            data = await ws.receive_json()
            try:
                cmd = SteeringCommand(**data)
            except Exception:
                await ws.send_json({"status": "error", "reason": "Invalid command format"})
                continue

            response = _handle_steering(cmd)
            await ws.send_json(response.model_dump())
    except WebSocketDisconnect:
        logger.info("WebSocket client disconnected")


def _handle_steering(cmd: SteeringCommand) -> SteeringResponse:
    """Process a steering command and update session state."""

    if cmd.command == SteeringAction.PAUSE:
        if session.status != SessionStatus.RUNNING:
            return SteeringResponse(
                command="PAUSE", status="invalid", reason="Agent is not running"
            )
        session.pause()
        event_bus.emit("reasoning", {
            "id": 0, "text": "[PAUSED by user]", "phase": session.current_phase,
        })
        return SteeringResponse(
            command="PAUSE", status="acknowledged", item_id=session.current_item_id
        )

    elif cmd.command == SteeringAction.RESUME:
        if session.status != SessionStatus.PAUSED:
            return SteeringResponse(
                command="RESUME", status="invalid", reason="Agent is not paused"
            )
        session.resume()
        event_bus.emit("reasoning", {
            "id": 0, "text": "[RESUMED by user]", "phase": session.current_phase,
        })
        return SteeringResponse(
            command="RESUME", status="acknowledged", item_id=session.current_item_id
        )

    elif cmd.command == SteeringAction.SKIP:
        if session.status not in (SessionStatus.RUNNING, SessionStatus.PAUSED):
            return SteeringResponse(
                command="SKIP", status="invalid", reason="No active conversion"
            )
        session.skip()
        event_bus.emit("reasoning", {
            "id": 0, "text": f"[SKIP requested for {session.current_item_id}]",
            "phase": session.current_phase,
        })
        # If paused, resume so agent can process the skip
        if session.status == SessionStatus.PAUSED:
            session.resume()
        return SteeringResponse(
            command="SKIP", status="acknowledged", item_id=session.current_item_id
        )

    elif cmd.command == SteeringAction.RETRY:
        item_id = cmd.item_id or session.current_item_id
        if not item_id:
            return SteeringResponse(
                command="RETRY", status="invalid", reason="No item_id specified"
            )
        session.retry(item_id)
        event_bus.emit("reasoning", {
            "id": 0, "text": f"[RETRY requested for {item_id}]",
            "phase": session.current_phase,
        })
        # If paused, resume so agent can process the retry
        if session.status == SessionStatus.PAUSED:
            session.resume()
        return SteeringResponse(
            command="RETRY", status="acknowledged", item_id=item_id
        )

    return SteeringResponse(command=cmd.command, status="error", reason="Unknown command")
