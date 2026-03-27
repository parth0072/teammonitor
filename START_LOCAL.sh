#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
#  TeamMonitor – Local Development Setup
#  Detects MySQL, creates DB, installs deps, starts everything, opens Xcode.
#  Run once: chmod +x START_LOCAL.sh && ./START_LOCAL.sh
# ─────────────────────────────────────────────────────────────────────────────

DIR="$(cd "$(dirname "$0")" && pwd)"
SERVER_DIR="$DIR/server"
ADMIN_DIR="$DIR/admin-panel"
XCODE_PROJ="$DIR/macos-agent/TeamMonitorAgent.xcodeproj"

DB_NAME="teammonitor_dev"
DB_USER="root"
DB_PASS=""          # Leave blank for no-password Homebrew/MAMP root
DB_PORT=3306

ADMIN_EMAIL="admin@teammonitor.local"
ADMIN_PASS="Admin1234"

GREEN="\033[0;32m"; YELLOW="\033[1;33m"; RED="\033[0;31m"; NC="\033[0m"; BOLD="\033[1m"

ok()   { echo -e "${GREEN}✓${NC}  $1"; }
warn() { echo -e "${YELLOW}⚠${NC}  $1"; }
err()  { echo -e "${RED}✗${NC}  $1"; }
step() { echo -e "\n${BOLD}──── $1 ────${NC}"; }

echo ""
echo -e "${BOLD}  🖥  TeamMonitor – Local Dev Launcher${NC}"
echo "  ────────────────────────────────────"

# ─── 1. Detect MySQL ──────────────────────────────────────────────────────────
step "1/7  Detecting MySQL"

MYSQL_BIN=""
MYSQL_START_CMD=""

# Homebrew (Apple Silicon)
if [ -x "/opt/homebrew/bin/mysql" ]; then
    MYSQL_BIN="/opt/homebrew/bin/mysql"
    MYSQL_START_CMD="brew services start mysql"
    ok "Found Homebrew MySQL (Apple Silicon)"

# Homebrew (Intel)
elif [ -x "/usr/local/bin/mysql" ]; then
    MYSQL_BIN="/usr/local/bin/mysql"
    MYSQL_START_CMD="brew services start mysql"
    ok "Found Homebrew MySQL (Intel)"

# MAMP
elif [ -x "/Applications/MAMP/Library/bin/mysql" ]; then
    MYSQL_BIN="/Applications/MAMP/Library/bin/mysql"
    DB_PORT=8889
    MYSQL_START_CMD="open -a MAMP"
    ok "Found MAMP MySQL (port 8889)"

# System MySQL
elif command -v mysql &>/dev/null; then
    MYSQL_BIN="$(command -v mysql)"
    MYSQL_START_CMD=""
    ok "Found system MySQL at $MYSQL_BIN"

else
    err "MySQL not found."
    echo ""
    echo "  Install options:"
    echo "    Homebrew:  brew install mysql && brew services start mysql"
    echo "    MAMP:      https://www.mamp.info/en/downloads/"
    echo ""
    exit 1
fi

# ─── 2. Start MySQL if not running ───────────────────────────────────────────
step "2/7  Starting MySQL"

if "$MYSQL_BIN" -u "$DB_USER" ${DB_PASS:+-p"$DB_PASS"} --port="$DB_PORT" -e "SELECT 1" &>/dev/null; then
    ok "MySQL is already running"
else
    warn "MySQL not running – attempting to start…"
    if [ -n "$MYSQL_START_CMD" ]; then
        eval "$MYSQL_START_CMD" &>/dev/null
        sleep 3
    fi
    if "$MYSQL_BIN" -u "$DB_USER" ${DB_PASS:+-p"$DB_PASS"} --port="$DB_PORT" -e "SELECT 1" &>/dev/null; then
        ok "MySQL started"
    else
        err "Could not connect to MySQL."
        echo ""
        echo "  If your root user has a password, edit START_LOCAL.sh line:"
        echo "    DB_PASS=\"your_password\""
        echo ""
        echo "  Or for MAMP, start the MAMP app manually first, then re-run."
        exit 1
    fi
fi

# ─── 3. Create database & run schema ─────────────────────────────────────────
step "3/7  Setting up database: $DB_NAME"

MYSQL_CMD="$MYSQL_BIN -u $DB_USER ${DB_PASS:+-p$DB_PASS} --port=$DB_PORT"

# Create database if not exists
$MYSQL_CMD -e "CREATE DATABASE IF NOT EXISTS \`$DB_NAME\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;" 2>/dev/null
ok "Database '$DB_NAME' ready"

# Run schema (idempotent – uses CREATE TABLE IF NOT EXISTS)
$MYSQL_CMD "$DB_NAME" < "$SERVER_DIR/schema.sql" 2>/dev/null
ok "Schema applied"

# ─── 4. Write server/.env ─────────────────────────────────────────────────────
step "4/7  Configuring server/.env"

if [ ! -f "$SERVER_DIR/.env" ]; then
    cat > "$SERVER_DIR/.env" <<EOF
DB_HOST=127.0.0.1
DB_PORT=$DB_PORT
DB_NAME=$DB_NAME
DB_USER=$DB_USER
DB_PASS=$DB_PASS

JWT_SECRET=local_dev_secret_$(openssl rand -hex 16 2>/dev/null || echo "changeme123")
JWT_EXPIRES_IN=7d

PORT=3001
BASE_URL=http://localhost:3001
EOF
    ok "Created server/.env"
else
    ok "server/.env already exists (skipping)"
fi

# ─── 5. Install npm dependencies ─────────────────────────────────────────────
step "5/7  Installing npm dependencies"

if [ ! -d "$SERVER_DIR/node_modules" ]; then
    echo "   📦 Installing server deps…"
    (cd "$SERVER_DIR" && npm install --silent) && ok "Server deps installed" || { err "npm install failed in server/"; exit 1; }
else
    ok "Server node_modules already present"
fi

if [ ! -d "$ADMIN_DIR/node_modules" ]; then
    echo "   📦 Installing admin panel deps…"
    (cd "$ADMIN_DIR" && npm install --silent) && ok "Admin panel deps installed" || { err "npm install failed in admin-panel/"; exit 1; }
else
    ok "Admin panel node_modules already present"
fi

# ─── 6. Create first admin user ──────────────────────────────────────────────
step "6/7  Creating admin user"

MARKER="$SERVER_DIR/.local_admin_created"
if [ -f "$MARKER" ]; then
    ok "Admin user already created (skipping)"
else
    echo "   Creating $ADMIN_EMAIL …"
    node -e "
require('dotenv').config({ path: '$SERVER_DIR/.env' });
const bcrypt  = require('bcryptjs');
const mysql   = require('mysql2/promise');

(async () => {
  const pool = await mysql.createPool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
  });
  const hash = await bcrypt.hash('$ADMIN_PASS', 10);
  try {
    await pool.execute(
      'INSERT INTO employees (name, email, password, role) VALUES (?, ?, ?, ?)',
      ['Admin', '$ADMIN_EMAIL', hash, 'admin']
    );
    console.log('created');
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') { console.log('exists'); }
    else { throw e; }
  }
  await pool.end();
})();
" 2>/dev/null
    touch "$MARKER"
    ok "Admin user ready"
    echo ""
    echo -e "   ${BOLD}Login credentials:${NC}"
    echo "     Email:    $ADMIN_EMAIL"
    echo "     Password: $ADMIN_PASS"
fi

# ─── 7. Launch services ───────────────────────────────────────────────────────
step "7/7  Launching services"

# Kill any stale processes on our ports
lsof -ti :3001 | xargs kill -9 2>/dev/null
lsof -ti :3000 | xargs kill -9 2>/dev/null
sleep 1

# Start API server
(cd "$SERVER_DIR" && npm start > /tmp/teammonitor-server.log 2>&1) &
SERVER_PID=$!
sleep 2

# Check server started
if curl -s http://localhost:3001/api/health | grep -q "ok" 2>/dev/null; then
    ok "API server running  → http://localhost:3001/api/health"
else
    warn "API server starting… (check /tmp/teammonitor-server.log if issues)"
fi

# Start admin panel
(cd "$ADMIN_DIR" && npm run dev -- --port 3000 > /tmp/teammonitor-admin.log 2>&1) &
ADMIN_PID=$!
sleep 2
ok "Admin panel starting → http://localhost:3000"

# Open Xcode
if [ -d "$XCODE_PROJ" ]; then
    open "$XCODE_PROJ"
    ok "Xcode opened"
else
    warn "Xcode project not found at $XCODE_PROJ"
fi

# ─── Summary ─────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}═══════════════════════════════════════════${NC}"
echo -e "${GREEN}${BOLD}  ✅  TeamMonitor is running locally!${NC}"
echo -e "${BOLD}═══════════════════════════════════════════${NC}"
echo ""
echo "  🌐  Admin Panel   →  http://localhost:3000"
echo "  🔌  API Server    →  http://localhost:3001/api/health"
echo "  🖥   macOS Agent   →  Build & Run in Xcode (⌘R)"
echo ""
echo -e "  ${BOLD}Admin login:${NC}"
echo "     Email:    $ADMIN_EMAIL"
echo "     Password: $ADMIN_PASS"
echo ""
echo "  📋  Logs:"
echo "     Server:  tail -f /tmp/teammonitor-server.log"
echo "     Admin:   tail -f /tmp/teammonitor-admin.log"
echo ""
echo "  Press Ctrl+C to stop all services."
echo ""

# ─── Wait & cleanup ──────────────────────────────────────────────────────────
cleanup() {
    echo ""
    echo "  Stopping services…"
    kill $SERVER_PID $ADMIN_PID 2>/dev/null
    exit 0
}
trap cleanup INT TERM

wait
