#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Phantom Renderer — Phase 3 smoke test
#
# Runs the renderer server locally and drives it with curl to confirm:
#   1. POST /generate accepts a job and returns a job_id
#   2. GET  /status/:id reports queued -> rendering -> done
#   3. The finished job has a result_url pointing at an MP4 in out/
#
# Requirements:
#   - pnpm installed
#   - From the repo root: pnpm install must have been run already
#
# Usage (from apps/renderer/):
#   bash smoke-test.sh
# ---------------------------------------------------------------------------

set -euo pipefail

RENDERER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$RENDERER_DIR/../.." && pwd)"
PORT=3001
BASE_URL="http://localhost:$PORT"
SERVER_PID=""

cleanup() {
  if [[ -n "$SERVER_PID" ]]; then
    echo ""
    echo "[smoke] Stopping server (PID $SERVER_PID)..."
    kill "$SERVER_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

# ---------------------------------------------------------------------------
# 1. Start the renderer server in the background
# ---------------------------------------------------------------------------
echo "[smoke] Starting renderer server on port $PORT..."
cd "$RENDERER_DIR"
LOCAL_DEV=true PORT=$PORT pnpm start &
SERVER_PID=$!

# Wait for the server to be ready (up to 15s)
echo "[smoke] Waiting for server to be ready..."
for i in $(seq 1 15); do
  if curl -sf "$BASE_URL/health" > /dev/null 2>&1; then
    echo "[smoke] Server is up."
    break
  fi
  if [[ $i -eq 15 ]]; then
    echo "[smoke] ERROR: Server did not start within 15 seconds."
    exit 1
  fi
  sleep 1
done

# ---------------------------------------------------------------------------
# 2. Check /health
# ---------------------------------------------------------------------------
echo ""
echo "[smoke] GET /health"
curl -s "$BASE_URL/health" | python3 -m json.tool

# ---------------------------------------------------------------------------
# 3. POST /generate with a RecursionTree job
#    This sends hardcoded props that match the RecursionTreeProps Zod schema.
#    The server returns immediately with a job_id; rendering runs in the background.
# ---------------------------------------------------------------------------
echo ""
echo "[smoke] POST /generate (RecursionTree)"

GENERATE_RESPONSE=$(curl -s -X POST "$BASE_URL/generate" \
  -H "Content-Type: application/json" \
  -d '{
    "template": "RecursionTree",
    "props": {
      "title": "fibonacci(3)",
      "functionName": "fib",
      "rootNode": {
        "id": "fib-3",
        "label": "fib(3)",
        "value": 2,
        "isDuplicate": false,
        "isBase": false,
        "depth": 0,
        "children": [
          {
            "id": "fib-2-a",
            "label": "fib(2)",
            "value": 1,
            "isDuplicate": false,
            "isBase": false,
            "depth": 1,
            "children": [
              {
                "id": "fib-1-a",
                "label": "fib(1)",
                "value": 1,
                "isDuplicate": false,
                "isBase": true,
                "depth": 2,
                "children": []
              },
              {
                "id": "fib-0-a",
                "label": "fib(0)",
                "value": 0,
                "isDuplicate": false,
                "isBase": true,
                "depth": 2,
                "children": []
              }
            ]
          },
          {
            "id": "fib-1-b",
            "label": "fib(1)",
            "value": 1,
            "isDuplicate": true,
            "isBase": true,
            "depth": 1,
            "children": []
          }
        ]
      }
    }
  }')

echo "$GENERATE_RESPONSE" | python3 -m json.tool
JOB_ID=$(echo "$GENERATE_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin)['job_id'])")
echo "[smoke] Job ID: $JOB_ID"

# ---------------------------------------------------------------------------
# 4. Poll /status/:id until done or failed (max 120s)
#    Rendering a short clip takes 30-90s depending on machine.
# ---------------------------------------------------------------------------
echo ""
echo "[smoke] Polling status (up to 120s for rendering to complete)..."
echo "        Note: first run is slow because the animations bundle is compiled."
echo "        Subsequent runs reuse the bundle cache and are much faster."
echo ""

FINAL_STATUS=""
for i in $(seq 1 120); do
  STATUS_RESPONSE=$(curl -s "$BASE_URL/status/$JOB_ID")
  CURRENT_STATUS=$(echo "$STATUS_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])")
  printf "\r[smoke] %ds — status: %-12s" "$i" "$CURRENT_STATUS"

  if [[ "$CURRENT_STATUS" == "done" || "$CURRENT_STATUS" == "failed" ]]; then
    FINAL_STATUS="$CURRENT_STATUS"
    break
  fi
  sleep 1
done

echo ""
echo ""

# ---------------------------------------------------------------------------
# 5. Print final result
# ---------------------------------------------------------------------------
echo "[smoke] Final status response:"
curl -s "$BASE_URL/status/$JOB_ID" | python3 -m json.tool

if [[ "$FINAL_STATUS" == "done" ]]; then
  RESULT_URL=$(curl -s "$BASE_URL/status/$JOB_ID" | python3 -c "import sys,json; print(json.load(sys.stdin)['result_url'])")
  # Strip file:// prefix for display
  MP4_PATH="${RESULT_URL#file://}"
  echo ""
  echo "[smoke] SUCCESS. MP4 written to: $MP4_PATH"
  echo "[smoke] Open it with: open \"$MP4_PATH\""
  ls -lh "$MP4_PATH" 2>/dev/null || true
elif [[ "$FINAL_STATUS" == "failed" ]]; then
  echo "[smoke] FAILED. See error in status response above."
  exit 1
else
  echo "[smoke] TIMEOUT: job did not complete within 120 seconds."
  exit 1
fi
