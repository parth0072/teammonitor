#!/bin/bash
# TeamMonitor – cPanel deploy script
# The React app is pre-built locally and committed to server/public/.
# cPanel only needs to pull the latest code and restart Node.
#
# Usage:  bash deploy.sh

set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"

echo "=== [1/2] Pulling latest code from main ==="
cd "$ROOT"
git pull origin main

echo "=== [2/2] Installing server dependencies ==="
cd "$ROOT/server"
npm install --omit=dev --no-audit

echo ""
echo "✓ Done! Restart your Node.js app in cPanel now."
echo "  (The admin panel is pre-built — no frontend build step needed)"
