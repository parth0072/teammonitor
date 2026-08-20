---
name: project-windows-agent
description: "Windows agent platform decision — Electron, alongside existing Swift macOS app"
metadata: 
  node_type: memory
  type: project
  originSessionId: c630c3fb-8c87-49d9-9515-19cc333c9c28
  modified: 2026-08-05T11:53:11.466Z
---

Native Swift macOS agent stays as-is and will always be maintained. A separate Windows agent will be built using Electron (not a cross-platform rewrite of the Swift app).

**Why:** Swift/SwiftUI is Apple-only. Electron was chosen for Windows because it's fastest to build. Two separate codebases — Swift for Mac, Electron for Windows.

**How to apply:** Never suggest replacing the Swift app with Electron. When working on macOS agent, use Swift. When working on Windows agent, use Electron in a separate directory (e.g. `windows-agent/`).
