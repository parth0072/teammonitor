#!/bin/bash
# TeamMonitor Agent – Uninstaller

APP_NAME="TeamMonitorAgent"
INSTALL_DIR="/Applications"
LAUNCH_AGENT_PLIST="$HOME/Library/LaunchAgents/com.alphabyte.teammonitor.plist"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info() { echo -e "${GREEN}▶ $1${NC}"; }

echo ""
echo "  TeamMonitor Agent – Uninstaller"
echo ""

info "Stopping TeamMonitor..."
pkill -x "$APP_NAME" 2>/dev/null || true
sleep 1

info "Removing auto-start..."
launchctl unload "$LAUNCH_AGENT_PLIST" 2>/dev/null || true
rm -f "$LAUNCH_AGENT_PLIST"

info "Removing app..."
rm -rf "$INSTALL_DIR/${APP_NAME}.app"

echo ""
echo -e "${GREEN}✓ TeamMonitor has been uninstalled.${NC}"
echo ""
