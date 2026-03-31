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
echo "=== [1/4] Pulling latest code from main ==="
cd "$ROOT"
git pull origin main

echo ""
echo "=== [3/4] Installing & building admin panel ==="
cd "$ROOT/admin-panel"
rm -rf node_modules package-lock.json
npm install --no-audit

# Add local bin to PATH so vite is found
export PATH="$ROOT/admin-panel/node_modules/.bin:$PATH"

# Verify vite installed correctly
if [ ! -f node_modules/.bin/vite ] && [ ! -L node_modules/.bin/vite ]; then
  echo "WARNING: node_modules/.bin/vite not found after install"
  echo "Checking vite package:"
  ls node_modules/vite/ 2>/dev/null || echo "  vite folder missing entirely"
fi

npm run build

echo "=== [4/4] Copying build to server/public ==="
rm -rf "$ROOT/server/public"
mkdir -p "$ROOT/server/public"
cp -r "$ROOT/admin-panel/dist/." "$ROOT/server/public/"

echo ""
echo "✓ Done! Restart your Node.js app in cPanel now."
