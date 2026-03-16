#!/usr/bin/env bash
# start.sh — Start both Backend (FastAPI) and Frontend (Vite) dev servers.
# Usage: ./start.sh

set -e

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_LOG="$ROOT_DIR/.backend.log"
FRONTEND_LOG="$ROOT_DIR/.frontend.log"

# ── Kill previous session on same ports ─────────────────────────────
echo "Killing any previous session on ports 8000 and 5173..."
lsof -ti :8000 | xargs kill -9 2>/dev/null || true
lsof -ti :5173 | xargs kill -9 2>/dev/null || true
sleep 1

# ── Clear previous conversion state (always start fresh) ────────────
echo "Clearing previous conversion state..."
rm -f "$ROOT_DIR/.cobol2py/state.json"
rm -f "$ROOT_DIR/output/conversion_plan.json"
rm -f "$ROOT_DIR/output/scan_results.json"
rm -f "$ROOT_DIR/output/structure_chart.json"
rm -rf "$ROOT_DIR/output/logs"
rm -rf "$ROOT_DIR/output/scores"
rm -rf "$ROOT_DIR/output/scores_cache"
rm -rf "$ROOT_DIR/output/programs"

cleanup() {
  echo ""
  echo "Shutting down..."
  [ -n "$BACKEND_PID" ] && kill "$BACKEND_PID" 2>/dev/null
  [ -n "$FRONTEND_PID" ] && kill "$FRONTEND_PID" 2>/dev/null
  wait 2>/dev/null
  echo "Done."
}
trap cleanup EXIT INT TERM

# ── Python environment check ─────────────────────────────────────────
if [ -z "$VIRTUAL_ENV" ]; then
  if [ -d "$ROOT_DIR/.venv" ]; then
    echo "Activating existing .venv..."
    source "$ROOT_DIR/.venv/bin/activate"
  else
    echo "No active virtualenv detected. Creating .venv..."
    python3 -m venv "$ROOT_DIR/.venv"
    source "$ROOT_DIR/.venv/bin/activate"
    echo "Installing Python dependencies..."
    pip install -q -r "$ROOT_DIR/requirements.txt"
  fi
elif ! python3 -c "import uvicorn" 2>/dev/null; then
  echo "Missing Python dependencies. Installing..."
  pip install -q -r "$ROOT_DIR/requirements.txt"
fi

# ── Frontend deps ────────────────────────────────────────────────────
if [ ! -d "$ROOT_DIR/Frontend/node_modules" ]; then
  echo "Installing Frontend dependencies..."
  (cd "$ROOT_DIR/Frontend" && npm install)
fi

# ── Start Backend ────────────────────────────────────────────────────
echo "Starting Backend on http://localhost:8000 ..."
(cd "$ROOT_DIR" && uvicorn Backend.api:app --host 0.0.0.0 --port 8000) \
  > "$BACKEND_LOG" 2>&1 &
BACKEND_PID=$!

# ── Start Frontend ───────────────────────────────────────────────────
echo "Starting Frontend on http://localhost:5173 ..."
(cd "$ROOT_DIR/Frontend" && npx vite --port 5173) \
  > "$FRONTEND_LOG" 2>&1 &
FRONTEND_PID=$!

# ── Wait for servers ─────────────────────────────────────────────────
echo ""
echo "Waiting for servers..."

for i in $(seq 1 30); do
  if curl -s http://localhost:8000/docs >/dev/null 2>&1; then
    echo "  Backend ready."
    break
  fi
  sleep 1
done

for i in $(seq 1 30); do
  if curl -s http://localhost:5173 >/dev/null 2>&1; then
    echo "  Frontend ready."
    break
  fi
  sleep 1
done

echo ""
echo "========================================="
echo "  App running at http://localhost:5173"
echo "  API docs at   http://localhost:8000/docs"
echo "========================================="
echo ""
echo "Press Ctrl+C to stop both servers."
echo "Logs: $BACKEND_LOG / $FRONTEND_LOG"
echo ""

# Keep script alive until Ctrl+C
wait
