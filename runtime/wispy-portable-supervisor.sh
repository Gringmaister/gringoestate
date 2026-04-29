#!/usr/bin/env bash
set -euo pipefail

export HOME="${HOME:-/data/home}"
export WISPY_PANEL_DATA_DIR="${WISPY_PANEL_DATA_DIR:-/data/panel}"
export OPENCLAW_GATEWAY_PORT="${OPENCLAW_GATEWAY_PORT:-18789}"
export OPENCLAW_GATEWAY_BIND="${OPENCLAW_GATEWAY_BIND:-lan}"
export WISPY_API_HOST="${WISPY_API_HOST:-0.0.0.0}"
export WISPY_API_PORT="${WISPY_API_PORT:-8788}"
export WISPY_RUNTIME_HOST="${WISPY_RUNTIME_HOST:-0.0.0.0}"
export WISPY_RUNTIME_PORT="${WISPY_RUNTIME_PORT:-8787}"
export WISPY_RUNTIME_PUBLIC="${WISPY_RUNTIME_PUBLIC:-1}"

mkdir -p "$HOME" "$WISPY_PANEL_DATA_DIR" /logs

if [ ! -d "$HOME/.openclaw" ] && [ -d /seed/openclaw ]; then
  echo "[wispy-core] importing seed .openclaw into portable home..."
  mkdir -p "$HOME/.openclaw"
  cp -a /seed/openclaw/. "$HOME/.openclaw/"
fi

if [ ! -f "$HOME/.openclaw/config.yaml" ]; then
  echo "[wispy-core] warning: no portable OpenClaw config found at $HOME/.openclaw/config.yaml"
fi

cleanup() {
  if [ -n "${API_PID:-}" ] && kill -0 "$API_PID" 2>/dev/null; then kill "$API_PID" 2>/dev/null || true; fi
  if [ -n "${GATEWAY_PID:-}" ] && kill -0 "$GATEWAY_PID" 2>/dev/null; then kill "$GATEWAY_PID" 2>/dev/null || true; fi
}
trap cleanup EXIT INT TERM

echo "[wispy-core] starting OpenClaw gateway on ${OPENCLAW_GATEWAY_PORT}..."
GATEWAY_CMD=(openclaw gateway run --allow-unconfigured --bind "${OPENCLAW_GATEWAY_BIND}" --port "${OPENCLAW_GATEWAY_PORT}")
if [ -n "${OPENCLAW_GATEWAY_TOKEN:-}" ]; then
  GATEWAY_CMD+=(--auth token --token "${OPENCLAW_GATEWAY_TOKEN}")
fi
"${GATEWAY_CMD[@]}" > /logs/gateway.log 2>&1 &
GATEWAY_PID=$!

sleep 3

echo "[wispy-core] starting Wispy portable API on ${WISPY_API_PORT}..."
node /workspace/gringoestate/runtime/wispy-portable-api.js > /logs/portable-api.log 2>&1 &
API_PID=$!

wait -n "$GATEWAY_PID" "$API_PID"
EXIT_CODE=$?
echo "[wispy-core] one process exited with code $EXIT_CODE"
exit "$EXIT_CODE"
