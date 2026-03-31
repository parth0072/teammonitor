#!/bin/bash
# TeamMonitor – full deploy script for cPanel shared hosting
# Run this after every git pull:
#   bash deploy.sh

set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"

# ── Find npm on cPanel (non-standard PATH) ────────────────────────────────────
if ! command -v npm &>/dev/null; then
  # cPanel stores node/npm inside nodevenv virtualenvs
  for NVDIR in "$HOME"/nodevenv/*/*/bin; do
    if [ -f "$NVDIR/npm" ]; then
      export PATH="$NVDIR:$PATH"
      break
    fi
  done
fi

# Also try common cPanel/EA-NodeJS locations
if ! command -v npm &>/dev/null; then
  for P in /usr/local/bin /opt/cpanel/ea-nodejs*/bin /usr/bin; do
    if [ -f "$P/npm" ]; then
      export PATH="$P:$PATH"
      break
    fi
  done
fi

if ! command -v npm &>/dev/null; then
  echo "ERROR: npm not found. Open cPanel > Node.js App terminal and run:"
  echo "  cd admin-panel && npm install && npm run build"
  echo "  cp -r dist/. ../server/public/"
  exit 1
fi

echo "Using npm: $(which npm) ($(npm --version))"

echo ""
echo "=== [1/3] Installing admin-panel dependencies ==="
cd "$ROOT/admin-panel"
npm install --silent

echo "=== [2/3] Building admin panel ==="
npm run build

echo "=== [3/3] Copying build to server/public ==="
rm -rf "$ROOT/server/public"
mkdir -p "$ROOT/server/public"
cp -r "$ROOT/admin-panel/dist/." "$ROOT/server/public/"

echo ""
echo "✓ Done! Restart your Node.js app in cPanel now."
