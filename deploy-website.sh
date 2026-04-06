#!/bin/bash
# TeamMonitor – marketing website deploy script
# Copies website/index.html to public_html/teammonitor/
#
# Usage (run from repo root in cPanel Terminal):
#   bash deploy-website.sh

set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"

# ── Destination: public_html/teammonitor ─────────────────────────────────────
DEST="$HOME/alphabyteinnovation.com/teammonitor"

echo "=== [1/2] Pulling latest code ==="
cd "$ROOT"
git pull origin main

echo "=== [2/2] Copying website to $DEST ==="
mkdir -p "$DEST"
cp "$ROOT/website/index.html" "$DEST/index.html"

echo ""
echo "✓ Done! Marketing website is live at:"
echo "  https://alphabyteinnovation.com/teammonitor"
