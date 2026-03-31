#!/bin/bash
# TeamMonitor – cPanel deploy script
# The React app is pre-built locally and committed to server/public/.
# cPanel only needs to pull the latest code and restart Node.
#
# Usage:  bash deploy.sh

set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"

# ── Find npm on cPanel (non-standard PATH) ────────────────────────────────────
if ! command -v npm &>/dev/null; then
  for NVDIR in "$HOME"/nodevenv/*/*/bin; do
    [ -f "$NVDIR/npm" ] && export PATH="$NVDIR:$PATH" && break
  done
fi
if ! command -v npm &>/dev/null; then
  for P in /usr/local/bin /opt/cpanel/ea-nodejs*/bin /usr/bin; do
    [ -f "$P/npm" ] && export PATH="$P:$PATH" && break
  done
fi
if ! command -v npm &>/dev/null; then
  echo "ERROR: npm not found. Restart Node manually from cPanel — server deps are already committed."
  exit 0
fi

echo "Using npm: $(which npm)"

echo "=== [1/2] Pulling latest code from main ==="
cd "$ROOT"
git pull origin main

echo "=== [2/2] Installing server dependencies ==="
cd "$ROOT/server"
npm install --omit=dev --no-audit

echo ""
echo "✓ Done! Restart your Node.js app in cPanel now."
