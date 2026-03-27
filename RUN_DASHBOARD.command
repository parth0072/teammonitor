#!/bin/bash
# ──────────────────────────────────────────────────────────────────
#  TeamMonitor – One-Click Dashboard Launcher
#  No MySQL needed. Double-click this file in Finder to start.
# ──────────────────────────────────────────────────────────────────
cd "$(dirname "$0")"
DIR="$(pwd)"
SERVER_DIR="$DIR/server"
ADMIN_DIR="$DIR/admin-panel"

GREEN="\033[0;32m"; YELLOW="\033[1;33m"; RED="\033[0;31m"; NC="\033[0m"; BOLD="\033[1m"
ok()   { echo -e "${GREEN}✓${NC}  $1"; }
warn() { echo -e "${YELLOW}⚠${NC}  $1"; }
err()  { echo -e "${RED}✗${NC}  $1"; exit 1; }

echo ""
echo -e "${BOLD}  🖥  TeamMonitor Dashboard${NC}"
echo "  ──────────────────────────"

# ── Check Node.js ──────────────────────────────────────────────────
if ! command -v node &>/dev/null; then
  err "Node.js not found. Install from https://nodejs.org"
fi
ok "Node.js $(node -v)"

# ── Install / rebuild server deps ─────────────────────────────────
echo "  Installing server dependencies (first run may take ~30s)..."
cd "$SERVER_DIR" && npm install 2>&1 | grep -v "^npm warn" | grep -v "^$" || true
ok "Server dependencies ready"

# ── Kill anything on ports 3001 / 3000 ────────────────────────────
lsof -ti:3001 | xargs kill -9 2>/dev/null
lsof -ti:3000 | xargs kill -9 2>/dev/null
sleep 1

# ── Write .env (no MySQL — SQLite only) ───────────────────────────
cat > "$SERVER_DIR/.env" <<EOF
JWT_SECRET=local_dev_secret_41eed97121b194621a3c38e420446f24
JWT_EXPIRES_IN=7d
PORT=3001
BASE_URL=http://localhost:3001
EOF

# ── Start API server ───────────────────────────────────────────────
echo ""
echo -e "${BOLD}[1/2] Starting API server...${NC}"
cd "$SERVER_DIR"
node index.js > /tmp/teammonitor_server.log 2>&1 &
SERVER_PID=$!

# Wait up to 8 seconds for server to be ready
for i in {1..8}; do
  sleep 1
  if curl -s http://localhost:3001/api/health >/dev/null 2>&1; then
    break
  fi
done

if ! curl -s http://localhost:3001/api/health >/dev/null 2>&1; then
  echo ""
  echo -e "${RED}Server log:${NC}"
  cat /tmp/teammonitor_server.log
  err "Server failed to start. See error above."
fi
ok "API server running → http://localhost:3001"

# ── Install admin panel deps if needed ────────────────────────────
if [ ! -d "$ADMIN_DIR/node_modules/vite" ]; then
  echo "  Installing admin panel dependencies..."
  cd "$ADMIN_DIR" && npm install --silent
  ok "Admin panel dependencies installed"
fi

# ── Start admin panel ─────────────────────────────────────────────
echo ""
echo -e "${BOLD}[2/2] Starting Admin Panel...${NC}"
cd "$ADMIN_DIR"
npm run dev -- --port 3000 > /tmp/teammonitor_admin.log 2>&1 &
ADMIN_PID=$!
sleep 4

# ── Done ───────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}─────────────────────────────────────────${NC}"
echo -e "${GREEN}  ✅  Dashboard is ready!${NC}"
echo ""
echo "   🌐  Open:      http://localhost:3000"
echo "   📧  Email:     admin@teammonitor.local"
echo "   🔑  Password:  Admin1234"
echo ""
echo "   Press Ctrl+C to stop."
echo -e "${BOLD}─────────────────────────────────────────${NC}"
echo ""

open "http://localhost:3000" 2>/dev/null

# Keep running until Ctrl+C, then clean up
trap "echo ''; echo 'Stopping...'; kill $SERVER_PID $ADMIN_PID 2>/dev/null; exit 0" INT
wait
