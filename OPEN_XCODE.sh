#!/bin/bash
# Open the macOS Agent in Xcode
# Usage: bash OPEN_XCODE.sh

PROJ="$(dirname "$0")/macos-agent/TeamMonitorAgent.xcodeproj"

if [ ! -f "macos-agent/TeamMonitorAgent/GoogleService-Info.plist" ]; then
  echo "⚠  GoogleService-Info.plist not found."
  echo "   Run 'bash setup.sh' first, or download it from Firebase Console."
  echo "   Firebase Console → Project Settings → Your apps → macOS → Download config"
  exit 1
fi

echo "📂 Opening TeamMonitorAgent in Xcode..."
echo ""
echo "Once Xcode opens:"
echo "  1. Wait for Swift Package Manager to resolve Firebase (first open takes ~2 min)"
echo "  2. Select 'TeamMonitorAgent' scheme and 'My Mac' target"
echo "  3. Press ⌘R to build and run"
echo "  4. Grant Screen Recording permission when prompted (System Settings → Privacy & Security)"
echo ""

open "$PROJ"
