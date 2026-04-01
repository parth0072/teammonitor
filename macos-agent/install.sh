#!/bin/bash
# TeamMonitor Agent – Installer / Updater
# Usage: curl -fsSL https://raw.githubusercontent.com/parth0072/teammonitor/main/macos-agent/install.sh | bash

set -euo pipefail

APP_NAME="TeamMonitorAgent"
GITHUB_REPO="parth0072/teammonitor"
INSTALL_DIR="/Applications"
DEST="$INSTALL_DIR/${APP_NAME}.app"
LAUNCH_AGENT_LABEL="com.alphabyte.teammonitor"
LAUNCH_AGENT_PLIST="$HOME/Library/LaunchAgents/${LAUNCH_AGENT_LABEL}.plist"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; BOLD='\033[1m'; NC='\033[0m'
info()  { echo -e "${GREEN}▶ $*${NC}"; }
warn()  { echo -e "${YELLOW}⚠ $*${NC}"; }
error() { echo -e "${RED}✗ $*${NC}"; exit 1; }
bold()  { echo -e "${BOLD}$*${NC}"; }

echo ""
echo "  ██████╗  ███████╗ █████╗ ███╗   ███╗"
echo "  ╚══██╔╝  ██╔════╝██╔══██╗████╗ ████║"
echo "     ██║   █████╗  ███████║██╔████╔██║"
echo "     ██║   ██╔══╝  ██╔══██║██║╚██╔╝██║"
echo "  ██████║  ███████╗██║  ██║██║ ╚═╝ ██║"
echo "  ╚═════╝  ╚══════╝╚═╝  ╚═╝╚═╝     ╚═╝"
echo "  TeamMonitor Agent Installer"
echo ""

# ── 1. macOS check ────────────────────────────────────────────────────────────
info "Checking system requirements..."
OS=$(sw_vers -productVersion)
MAJOR=$(echo "$OS" | cut -d. -f1)
[ "$MAJOR" -lt 12 ] && error "macOS 12 (Monterey) or later required. You have $OS."
echo "  macOS $OS ✓"

# ── 2. Fetch latest release info ──────────────────────────────────────────────
info "Fetching latest release..."
RELEASE_JSON=$(curl -fsSL \
  -H "Accept: application/vnd.github+json" \
  "https://api.github.com/repos/${GITHUB_REPO}/releases/latest" \
  || error "Could not reach GitHub API. Check your internet connection.")

LATEST_TAG=$(echo "$RELEASE_JSON" | grep '"tag_name"' | head -1 | sed 's/.*"tag_name": *"\([^"]*\)".*/\1/')
DOWNLOAD_URL=$(echo "$RELEASE_JSON" | grep '"browser_download_url"' | grep 'TeamMonitorAgent.zip' | head -1 | sed 's/.*"browser_download_url": *"\([^"]*\)".*/\1/')

[ -z "$LATEST_TAG" ] && error "Could not determine latest version."
[ -z "$DOWNLOAD_URL" ] && error "Could not find TeamMonitorAgent.zip in the latest release."

echo "  Latest version : ${LATEST_TAG}"

# Show currently installed version (if any)
if [ -d "$DEST" ]; then
  CURRENT_VER=$(defaults read "$DEST/Contents/Info" CFBundleShortVersionString 2>/dev/null || echo "unknown")
  echo "  Installed      : ${CURRENT_VER}"
  if [ "$CURRENT_VER" = "${LATEST_TAG#v}" ]; then
    warn "Version ${LATEST_TAG} is already installed."
    read -r -p "  Force reinstall? [y/N] " FORCE
    [[ "$FORCE" =~ ^[Yy]$ ]] || { echo "  Aborted."; exit 0; }
  fi
fi

# ── 3. Download ───────────────────────────────────────────────────────────────
TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

info "Downloading ${APP_NAME} ${LATEST_TAG}..."
curl -fL --progress-bar "$DOWNLOAD_URL" -o "$TMP_DIR/${APP_NAME}.zip" \
  || error "Download failed."

# ── 4. Extract ────────────────────────────────────────────────────────────────
info "Extracting..."
unzip -q "$TMP_DIR/${APP_NAME}.zip" -d "$TMP_DIR/" \
  || error "Failed to extract zip."

APP_SRC=$(find "$TMP_DIR" -name "${APP_NAME}.app" -maxdepth 3 | head -1)
[ -z "$APP_SRC" ] && error "${APP_NAME}.app not found in zip."

# ── 5. Remove quarantine ──────────────────────────────────────────────────────
info "Removing quarantine flag..."
xattr -rd com.apple.quarantine "$APP_SRC" 2>/dev/null || true

# ── 6. Install to /Applications (needs sudo) ─────────────────────────────────
info "Installing to $INSTALL_DIR..."
echo "  Administrator password required to install into /Applications"

if [ -d "$DEST" ]; then
  warn "Stopping running instance..."
  pkill -x "$APP_NAME" 2>/dev/null || true
  sleep 1
  sudo rm -rf "$DEST"
fi

sudo cp -R "$APP_SRC" "$INSTALL_DIR/"
sudo xattr -rd com.apple.quarantine "$DEST" 2>/dev/null || true
echo "  Installed ${LATEST_TAG} to $DEST ✓"

# ── 7. LaunchAgent – auto-start on login ─────────────────────────────────────
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

launchctl unload "$LAUNCH_AGENT_PLIST" 2>/dev/null || true
launchctl load  "$LAUNCH_AGENT_PLIST"
echo "  Auto-start enabled ✓"

# ── 8. Launch ─────────────────────────────────────────────────────────────────
info "Launching TeamMonitor..."
open "$DEST"

echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  ✓ TeamMonitor ${LATEST_TAG} installed!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "  App      : $DEST"
echo "  Version  : ${LATEST_TAG}"
echo "  Auto-start: enabled (runs on every login)"
echo "  Logs     : ~/Library/Logs/TeamMonitor.log"
echo ""
echo "  To update later, re-run the same install command."
echo "  To uninstall:"
echo "    bash <(curl -fsSL https://raw.githubusercontent.com/${GITHUB_REPO}/main/macos-agent/uninstall.sh)"
echo ""
