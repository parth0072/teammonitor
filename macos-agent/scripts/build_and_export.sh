#!/bin/bash
# build_and_export.sh — Build TeamMonitorAgent.app and export a signed .dmg
#
# Usage:
#   chmod +x scripts/build_and_export.sh
#   ./scripts/build_and_export.sh
#
# Requirements: Xcode command-line tools, valid Apple Developer signing identity
# Run from the macos-agent/ directory.

set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────────────
PROJECT="TeamMonitorAgent.xcodeproj"
SCHEME="TeamMonitorAgent"
CONFIGURATION="Release"
ARCHIVE_PATH="build/TeamMonitorAgent.xcarchive"
EXPORT_PATH="build/export"
APP_NAME="TeamMonitorAgent"
DMG_NAME="TeamMonitorAgent-$(date +%Y%m%d).dmg"
DMG_PATH="build/$DMG_NAME"

# ── Clean build folder ────────────────────────────────────────────────────────
echo "→ Cleaning build folder…"
rm -rf build/
mkdir -p build

# ── Archive ───────────────────────────────────────────────────────────────────
echo "→ Archiving $SCHEME ($CONFIGURATION)…"
xcodebuild archive \
  -project "$PROJECT" \
  -scheme  "$SCHEME" \
  -configuration "$CONFIGURATION" \
  -archivePath "$ARCHIVE_PATH" \
  CODE_SIGN_STYLE=Automatic \
  | grep -E "(error:|warning:|Archive Succeeded|FAILED)" || true

if [ ! -d "$ARCHIVE_PATH" ]; then
  echo "✗ Archive failed — check xcodebuild output above."
  exit 1
fi
echo "✓ Archive created: $ARCHIVE_PATH"

# ── Export options plist ──────────────────────────────────────────────────────
cat > build/ExportOptions.plist <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key>
  <string>development</string>
  <key>signingStyle</key>
  <string>automatic</string>
  <key>stripSwiftSymbols</key>
  <true/>
</dict>
</plist>
PLIST

# ── Export .app ───────────────────────────────────────────────────────────────
echo "→ Exporting .app…"
xcodebuild -exportArchive \
  -archivePath "$ARCHIVE_PATH" \
  -exportPath  "$EXPORT_PATH" \
  -exportOptionsPlist build/ExportOptions.plist \
  | grep -E "(error:|warning:|Export Succeeded|FAILED)" || true

APP_BUNDLE="$EXPORT_PATH/$APP_NAME.app"
if [ ! -d "$APP_BUNDLE" ]; then
  echo "✗ Export failed. Check build/ExportOptions.plist and signing settings."
  exit 1
fi
echo "✓ Exported: $APP_BUNDLE"

# ── Package as DMG ────────────────────────────────────────────────────────────
echo "→ Creating DMG…"
hdiutil create \
  -volname "TeamMonitor" \
  -srcfolder "$APP_BUNDLE" \
  -ov -format UDZO \
  "$DMG_PATH" \
  > /dev/null

echo "✓ DMG ready: $DMG_PATH"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Build complete → $DMG_PATH"
echo "  $(du -sh "$DMG_PATH" | cut -f1)  ($(du -sh "$APP_BUNDLE" | cut -f1) uncompressed)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "To install on this Mac:"
echo "  open $DMG_PATH"
echo ""
echo "To distribute to employees:"
echo "  Upload $DMG_PATH to your file server / Google Drive / cPanel."
