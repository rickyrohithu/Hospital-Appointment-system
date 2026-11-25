#!/bin/bash
# start.sh — starts both backend and frontend in one command

set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
PYTHON_BIN="$ROOT/backend/.venv/bin/python"

if [ ! -f "$PYTHON_BIN" ]; then
    echo "❌ Virtualenv not found at $ROOT/backend/.venv"
    echo "Creating it now..."
    python3 -m venv "$ROOT/backend/.venv"
    "$ROOT/backend/.venv/bin/pip" install -r "$ROOT/backend/requirements.txt"
fi

# --- Backend ---
echo "▶ Starting backend on :8000 …"
cd "$ROOT"
"$PYTHON_BIN" -m backend.server &
BACKEND_PID=$!

# --- Frontend ---
echo "▶ Starting frontend on :5173 …"
cd "$ROOT/frontend"
npm run dev -- --host 0.0.0.0 &
FRONTEND_PID=$!

echo ""
echo "✅ MedBook running!"
echo "   Frontend → http://localhost:5173"
echo "   Backend  → http://localhost:8000"
echo ""
echo "Press Ctrl+C to stop both servers."

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null || true" EXIT INT TERM
wait
