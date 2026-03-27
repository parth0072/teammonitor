#!/bin/bash
# ═══════════════════════════════════════════════════════════════
#  TeamMonitor — cPanel Terminal Setup Script
#  Run this in cPanel → Terminal after uploading the zip.
#
#  Usage:
#    bash ~/teammonitor/server/cpanel_setup.sh
# ═══════════════════════════════════════════════════════════════

GREEN="\033[0;32m"; YELLOW="\033[1;33m"; RED="\033[0;31m"; CYAN="\033[0;36m"; BOLD="\033[1m"; NC="\033[0m"
ok()    { echo -e "${GREEN}✓${NC}  $1"; }
warn()  { echo -e "${YELLOW}⚠${NC}  $1"; }
err()   { echo -e "${RED}✗  ERROR: $1${NC}"; exit 1; }
info()  { echo -e "${CYAN}ℹ${NC}  $1"; }
title() { echo -e "\n${BOLD}$1${NC}"; }

# ── Detect home directory & app path ────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="$SCRIPT_DIR"
HOME_DIR="$HOME"
CPANEL_USER="$(whoami)"

echo ""
echo -e "${BOLD}╔══════════════════════════════════════╗${NC}"
echo -e "${BOLD}║   TeamMonitor — cPanel Setup         ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════╝${NC}"
echo ""
info "User: $CPANEL_USER"
info "App dir: $APP_DIR"
echo ""

# ── Step 1: Collect MySQL credentials ───────────────────────────
title "── Step 1: MySQL Database Details ──────────────────"
echo ""
echo "  Create a database in cPanel → MySQL Databases first."
echo "  Then enter those details here:"
echo ""

read -p "  Database name  (e.g. ${CPANEL_USER}_teammonitor): " DB_NAME
read -p "  Database user  (e.g. ${CPANEL_USER}_tmuser):     " DB_USER
read -s -p "  Database password:                              " DB_PASS
echo ""
read -p "  Your domain    (e.g. https://yourdomain.com):   " DOMAIN

# Strip trailing slash from domain
DOMAIN="${DOMAIN%/}"

echo ""

# ── Step 2: Write .env ───────────────────────────────────────────
title "── Step 2: Writing configuration ───────────────────"

JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))" 2>/dev/null || \
             cat /dev/urandom | tr -dc 'a-zA-Z0-9' | fold -w 64 | head -n 1)

cat > "$APP_DIR/.env" <<EOF
# ── Database ──────────────────────────────────────────
DB_HOST=localhost
DB_PORT=3306
DB_NAME=${DB_NAME}
DB_USER=${DB_USER}
DB_PASS=${DB_PASS}

# ── Auth ──────────────────────────────────────────────
JWT_SECRET=${JWT_SECRET}
JWT_EXPIRES_IN=7d

# ── Server ────────────────────────────────────────────
BASE_URL=${DOMAIN}
EOF

ok ".env written"

# ── Step 3: Install npm dependencies ────────────────────────────
title "── Step 3: Installing dependencies ─────────────────"
echo "  (This takes ~1 minute on first run)"
echo ""

cd "$APP_DIR"

# Use the Node.js version activated in cPanel if available
if [ -f "$HOME/nodevenv/teammonitor/server/"*/bin/activate ]; then
  source "$HOME/nodevenv/teammonitor/server/"*/bin/activate 2>/dev/null
fi

npm install --omit=dev 2>&1 | grep -v "^npm warn" | grep -v "^$" | head -30

if [ -d "$APP_DIR/node_modules/express" ]; then
  ok "Dependencies installed"
else
  err "npm install failed. Check Node.js version in cPanel Setup Node.js App."
fi

# ── Step 4: Test the app starts ─────────────────────────────────
title "── Step 4: Testing app startup ──────────────────────"

timeout 5 node "$APP_DIR/index.js" > /tmp/tm_test.log 2>&1 &
TEST_PID=$!
sleep 3
kill $TEST_PID 2>/dev/null

if grep -q "running on port" /tmp/tm_test.log; then
  ok "App starts successfully"
  grep "✓" /tmp/tm_test.log | while read line; do info "  $line"; done
else
  warn "Could not verify startup. Check log:"
  cat /tmp/tm_test.log
fi

# ── Done ────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}══════════════════════════════════════════════${NC}"
echo -e "${GREEN}  ✅  Setup complete!${NC}"
echo ""
echo -e "  ${BOLD}One last step — in cPanel:${NC}"
echo ""
echo -e "  1. Go to ${CYAN}Setup Node.js App${NC}"
echo -e "  2. Click ${CYAN}Create Application${NC}"
echo ""
echo -e "     Application root:  ${BOLD}teammonitor/server${NC}"
echo -e "     Startup file:      ${BOLD}index.js${NC}"
echo -e "     Application URL:   ${BOLD}$(echo $DOMAIN | sed 's|https\?://||')${NC}"
echo -e "     Node.js version:   ${BOLD}18 or 20${NC}"
echo ""
echo -e "  3. Click ${CYAN}Create${NC} then ${CYAN}Start App${NC}"
echo ""
echo -e "  🌐 Your dashboard: ${BOLD}${DOMAIN}${NC}"
echo -e "  📧 Login: admin@teammonitor.local / Admin1234"
echo -e "${BOLD}══════════════════════════════════════════════${NC}"
echo ""
