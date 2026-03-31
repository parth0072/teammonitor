#!/bin/bash
# TeamMonitor Agent – One-time installer
# Usage: curl -fsSL https://api.alphabyteinnovation.com/teammonitor/install.sh | bash
# Or:    bash install.sh

set -e

APP_NAME="TeamMonitorAgent"
DISPLAY_NAME="TeamMonitor"
BUNDLE_ID="com.alphabyte.TeamMonitorAgent"
GITHUB_REPO="parth0072/teammonitor"
DOWNLOAD_URL="https://github.com/${GITHUB_REPO}/releases/latest/download/TeamMonitorAgent.zip"
INSTALL_DIR="/Applications"
LAUNCH_AGENT_LABEL="com.alphabyte.teammonitor"
LAUNCH_AGENT_PLIST="$HOME/Library/LaunchAgents/${LAUNCH_AGENT_LABEL}.plist"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
info()    { echo -e "${GREEN}▶ $1${NC}"; }
warn()    { echo -e "${YELLOW}⚠ $1${NC}"; }
error()   { echo -e "${RED}✗ $1${NC}"; exit 1; }

echo ""
echo "  ██████╗  ███████╗ █████╗ ███╗   ███╗"
echo "  ╚══██╔╝  ██╔════╝██╔══██╗████╗ ████║"
echo "     ██║   █████╗  ███████║██╔████╔██║"
echo "     ██║   ██╔══╝  ██╔══██║██║╚██╔╝██║"
echo "  ██████║  ███████╗██║  ██║██║ ╚═╝ ██║"
echo "  ╚═════╝  ╚══════╝╚═╝  ╚═╝╚═╝     ╚═╝"
echo "  TeamMonitor Agent Installer"
echo ""

# ── 1. Check macOS ────────────────────────────────────────────────────────────
info "Checking system requirements..."
OS=$(sw_vers -productVersion)
MAJOR=$(echo "$OS" | cut -d. -f1)
if [ "$MAJOR" -lt 12 ]; then
  error "macOS 12 (Monterey) or later required. You have $OS."
fi
echo "  macOS $OS ✓"

# ── 2. Download ───────────────────────────────────────────────────────────────
TMP_DIR=$(mktemp -d)
trap "rm -rf $TMP_DIR" EXIT

info "Downloading TeamMonitor Agent..."
if command -v curl &>/dev/null; then
  curl -fsSL --progress-bar "$DOWNLOAD_URL" -o "$TMP_DIR/${APP_NAME}.zip" \
    || error "Download failed. Check your internet connection."
else
  error "curl not found."
fi

# ── 3. Extract ────────────────────────────────────────────────────────────────
info "Extracting..."
unzip -q "$TMP_DIR/${APP_NAME}.zip" -d "$TMP_DIR/" \
  || error "Failed to extract zip."

APP_PATH=$(find "$TMP_DIR" -name "${APP_NAME}.app" -maxdepth 2 | head -1)
[ -z "$APP_PATH" ] && error "${APP_NAME}.app not found in zip."

# ── 4. Remove quarantine (bypass Gatekeeper) ─────────────────────────────────
info "Removing macOS quarantine flag..."
xattr -rd com.apple.quarantine "$APP_PATH" 2>/dev/null || true

# ── 5. Install to /Applications ──────────────────────────────────────────────
info "Installing to $INSTALL_DIR..."
DEST="$INSTALL_DIR/${APP_NAME}.app"

# Remove old version if present
if [ -d "$DEST" ]; then
  warn "Existing installation found — replacing..."
  # Stop running instance first
  pkill -x "$APP_NAME" 2>/dev/null || true
  sleep 1
  rm -rf "$DEST"
fi

cp -R "$APP_PATH" "$INSTALL_DIR/"
echo "  Installed to $DEST ✓"

# ── 6. LaunchAgent – auto-start on login ─────────────────────────────────────
info "Setting up auto-start on login..."
mkdir -p "$HOME/Library/LaunchAgents"

cat > "$LAUNCH_AGENT_PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${LAUNCH_AGENT_LABEL}</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/bin/open</string>
        <string>-a</string>
        <string>${DEST}</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <false/>
    <key>StandardOutPath</key>
    <string>${HOME}/Library/Logs/TeamMonitor.log</string>
    <key>StandardErrorPath</key>
    <string>${HOME}/Library/Logs/TeamMonitor.log</string>
</dict>
</plist>
PLIST

# Load the launch agent
launchctl unload "$LAUNCH_AGENT_PLIST" 2>/dev/null || true
launchctl load "$LAUNCH_AGENT_PLIST"
echo "  Auto-start enabled ✓"

# ── 7. Launch now ────────────────────────────────────────────────────────────
info "Launching TeamMonitor..."
open "$DEST"

echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  ✓ TeamMonitor installed successfully!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "  • App location : $DEST"
echo "  • Auto-start   : enabled (runs on every login)"
echo "  • Logs         : ~/Library/Logs/TeamMonitor.log"
echo ""
echo "  To uninstall, run:"
echo "    bash <(curl -fsSL https://raw.githubusercontent.com/${GITHUB_REPO}/main/macos-agent/uninstall.sh)"
echo ""
