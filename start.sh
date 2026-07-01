#!/usr/bin/env bash
# GraphGuard — one-command launcher (macOS / Linux)
set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"

echo "🛡️  Starting GraphGuard..."

# --- Backend ---
cd "$ROOT/backend"
if [ ! -d ".venv" ]; then
  python3 -m venv .venv
  ./.venv/bin/pip install --upgrade pip
  ./.venv/bin/pip install -r requirements.txt
  echo "If torch is missing: ./.venv/bin/pip install torch"
fi
./.venv/bin/uvicorn app.main:app --reload --port 8000 &
BACK_PID=$!

# --- Frontend ---
cd "$ROOT/frontend"
[ -d node_modules ] || npm install
npm run dev &
FRONT_PID=$!

echo "✅ Backend  -> http://127.0.0.1:8000/docs"
echo "✅ Frontend -> http://localhost:5180"
trap "kill $BACK_PID $FRONT_PID" EXIT
wait
