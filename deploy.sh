#!/bin/bash
# TeamMonitor – full deploy script
# Run this on cPanel after every git pull:
#   bash deploy.sh

set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"

echo "=== [1/3] Building admin panel ==="
cd "$ROOT/admin-panel"
npm install --silent
npm run build

echo "=== [2/3] Copying build to server/public ==="
rm -rf "$ROOT/server/public"
mkdir -p "$ROOT/server/public"
cp -r "$ROOT/admin-panel/dist/." "$ROOT/server/public/"

echo "=== [3/3] Done! Restart your Node.js app in cPanel now. ==="
echo "    (or run: cd server && npm install)"
